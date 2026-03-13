-- Enable pgvector extension for vector embeddings (RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Users Table
-- Stores all users of the system (Lawyers and Admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('LAWYER', 'ADMIN')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Cases Table
-- Stores the legal cases managed by the firm
CREATE TABLE cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL, -- Added a title for easier identification
    status VARCHAR(50) NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'ARCHIVED')) DEFAULT 'OPEN',
    client_name VARCHAR(255), -- Renamed from 'plaintiff' to generally 'client' or 'party' depending on side, keeping 'client_name' is usually safer
    court_name VARCHAR(255),
    case_number VARCHAR(100), -- specific court case number
    metadata JSONB DEFAULT '{}', -- Flexible JSON for extra details (judge name, next hearing date, etc.)
    created_by UUID REFERENCES users(id), -- Who opened the case
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Case Assignments Table
-- Junction table for Many-to-Many relationship between Lawyers and Cases
-- Controlled by Admin
CREATE TABLE case_assignments (
    lawyer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    access_level VARCHAR(50) NOT NULL CHECK (access_level IN ('VIEW', 'EDIT', 'ADMIN')), -- VIEW: read-only, EDIT: add docs/notes, ADMIN: full control of case
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lawyer_id, case_id)
);

-- 4. Folders Table (Virtual File System)
-- Allows nesting of documents within a case, similar to a PC file system
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    parent_folder_id UUID REFERENCES folders(id) ON DELETE CASCADE, -- Self-referencing for nesting
    name VARCHAR(255) NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Documents Table
-- Metadata references to files stored in object storage (S3/MinIO/Disk)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL, -- specific folder, null means root of case
    uploader_id UUID REFERENCES users(id),
    
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    storage_path VARCHAR(512) NOT NULL, -- path in S3 or local disk
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    page_count INTEGER DEFAULT 0,
    
    processing_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (processing_status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),
    processing_error TEXT, -- Populated when processing_status = 'FAILED'
    
    summary TEXT, -- LLM generated summary of the whole doc
    doc_embedding vector(768), -- Vector representation of the entire document summary (Google text-embedding-004 / nomic-embed-text)
    tags TEXT[], -- Array of strings for tagging (e.g., "Affidavit", "Evidence")
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Document Chunks Table (The "Brain" of RAG)
-- Stores split text segments for granular search
CREATE TABLE doc_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    
    chunk_index INTEGER NOT NULL, -- To order chunks if needed
    page_number INTEGER, -- Helpful for citations: "See page 4"
    
    original_text TEXT NOT NULL, -- The actual text content
    keywords TEXT[], -- Extracted keywords for hybrid search
    
    embedding vector(768), -- 768 dims: Google text-embedding-004 / nomic-embed-text (swap with no schema migration)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Chat Threads Table
-- Stores conversation history for a case
CREATE TABLE chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    title VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Messages Table
-- Uses BIGSERIAL for sequential ordering. Within a thread:
-- Even position_index (0, 2, 4...) = USER message
-- Odd  position_index (1, 3, 5...) = AI message
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES chat_threads(id) ON DELETE CASCADE,
    position_index INTEGER NOT NULL,                               -- 0-based index within the thread (even=USER, odd=AI)
    sender_type VARCHAR(50) CHECK (sender_type IN ('USER', 'AI')),
    content TEXT NOT NULL,
    citations JSONB,                                               -- Stores references to doc_chunks used in the answer
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (thread_id, position_index)                             -- Prevent duplicate positions within a thread
);

-- Create HNSW index for fast similarity search on chunks
CREATE INDEX ON doc_chunks USING hnsw (embedding vector_cosine_ops);
-- Create GIN index for JSONB metadata searching
CREATE INDEX idx_cases_metadata ON cases USING gin (metadata);
