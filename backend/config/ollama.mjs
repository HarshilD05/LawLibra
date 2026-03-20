import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let ollamaProcess = null;

export async function initOllama() {
    const useLocalEmbed = (process.env.EMBEDDING_METHOD || '').toLowerCase() === 'ollama_local';
    const useLocalLLM   = (process.env.LLM_PROVIDER || '').toLowerCase() === 'ollama_local';

    if (!useLocalEmbed && !useLocalLLM) {
        return; // Server is not configured to use local Ollama, skip checks.
    }

    console.log('[Ollama Init] Local Ollama usage detected. Checking configuration...');

    // 1. Check if Ollama is installed via terminal command
    try {
        await new Promise((resolve, reject) => {
            exec('ollama --version', (err, stdout) => {
                if (err) {
                    return reject(new Error('Ollama CLI not found. Is it installed in your PATH?'));
                }
                console.log(`[Ollama Init] Found ${stdout.trim()}`);
                resolve();
            });
        });
    } catch (e) {
        console.error(`\n[Ollama Init] ERROR: ${e.message}`);
        console.error('Please install Ollama from https://ollama.com before continuing.\n');
        process.exit(1);
    }

    // 2. Check if Ollama is currently running in the background
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    let isRunning = false;
    try {
        const res = await fetch(baseUrl);
        if (res.ok) isRunning = true;
    } catch (e) {
        // Fetch failed, service is down
        isRunning = false;
    }

    // 3. Spawn process if not running
    if (!isRunning) {
        console.log('[Ollama Init] Service is not running. Spawning background service...');
        
        // Ensure logs directory exists
        const logsDir = path.resolve(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        const logStream = fs.createWriteStream(path.join(logsDir, 'ollama.log'), { flags: 'a' });
        
        ollamaProcess = spawn('ollama', ['serve'], { 
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true // Prevents a command window from popping up on Windows
        });

        // Link the logs
        ollamaProcess.stdout.pipe(logStream);
        ollamaProcess.stderr.pipe(logStream);

        // Poll the service until it becomes responsive (max 15 seconds)
        console.log('[Ollama Init] Waiting for Ollama to become responsive...');
        let attempts = 0;
        while (!isRunning && attempts < 15) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const res = await fetch(baseUrl);
                if (res.ok) isRunning = true;
            } catch {
                attempts++;
            }
        }

        if (!isRunning) {
            console.error('[Ollama Init] ERROR: Spawned Ollama but it failed to respond. Check backend/logs/ollama.log for details.');
            process.exit(1);
        }

        console.log('[Ollama Init] Ollama service successfully initialized in the background.');

        // Cleanup: Kill background process gracefully if the server is terminated
        const killOllama = () => {
            if (ollamaProcess) {
                console.log('\n[Ollama Init] Reaping background Ollama service...');
                ollamaProcess.kill('SIGTERM');
                ollamaProcess = null;
            }
        };
        
        process.on('exit', killOllama);
        process.on('SIGINT', () => { killOllama(); process.exit(0); });
        process.on('SIGTERM', () => { killOllama(); process.exit(0); });
    } else {
        console.log('[Ollama Init] Service is already running in the background.');
    }

    // 4. Model Checks (Only check if their respective variable is not empty)
    console.log('[Ollama Init] Checking installed models...');
    try {
        const res = await fetch(`${baseUrl}/api/tags`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        const installedModels = data.models?.map(m => m.name) || [];

        const verifyModel = (type, modelName) => {
            if (!modelName) return; 
            
            // Ollama stores tags, e.g. 'llama3.2' -> 'llama3.2:latest'
            const isInstalled = installedModels.some(m => m === modelName || m.startsWith(`${modelName}:`));
            
            if (!isInstalled) {
                console.warn(`[Ollama Init] ⚠️ WARNING: Your requested ${type} ('${modelName}') is not installed.`);
                console.warn(`              Please run: ollama pull ${modelName}\n`);
            } else {
                console.log(`[Ollama Init] ✓ Model '${modelName}' is installed.`);
            }
        };

        if (useLocalEmbed) {
            // Check whichever embedder variable exists locally (either fallback or primary)
            const embedModel = process.env.OLLAMA_EMBEDDING_MODEL;
            if (embedModel && embedModel.trim() !== '') {
                verifyModel('OLLAMA_EMBEDDER_MODEL', embedModel.trim());
            }
        }

        if (useLocalLLM) {
            const llmModel = process.env.LLM_MODEL;
            if (llmModel && llmModel.trim() !== '') {
                verifyModel('LLM_MODEL', llmModel.trim());
            }
        }

    } catch (e) {
        console.warn(`[Ollama Init] ⚠️ WARNING: Could not fetch models via /api/tags to verify installation: ${e.message}`);
    }

    console.log('[Ollama Init] Complete.');
}
