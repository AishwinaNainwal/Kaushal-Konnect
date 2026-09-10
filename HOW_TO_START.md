# 🚀 How to Start with Kaushal Konnect

This guide will get you up and running with the Kaushal Konnect project quickly.

## 📋 Prerequisites
Ensure you have the following installed:
- **Node.js** (v18+) & **npm**
- **Python 3.10+**
- **PostgreSQL** (running locally or via Docker)
- **Docker & Docker Compose** (Optional, but recommended)

---

## 🐳 Option A: Fast Start with Docker (Recommended)
If you have Docker installed, you can launch the entire environment in one command:

1. **Launch the system**:
   ```bash
   docker-compose up -d --build
   ```
2. **Initialize Database**:
   Once the containers are running, run the migration script inside the backend container:
   ```bash
   docker exec -it kk_backend python migrate_data.py
   ```
3. **Access the App**:
   - Frontend: `https://kaushal-konnect.onrender.com`
   - Backend API: `https://kaushal-konnect.onrender.com`

---

## ⚙️ Option B: Manual Local Setup

### 1. Backend Setup
1. **Navigate to backend**:
   ```bash
   cd backend
   ```
2. **Create Virtual Environment**:
   ```bash
   python -m venv .venv
   # Activate on Windows:
   .venv\Scripts\activate
   # Activate on Mac/Linux:
   source .venv/bin/activate
   ```
3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
4. **Configure Environment**:
   - Create a `.env` file in the root directory.
   - Add your database URL:
     ```env
     DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/kaushal_konnect
     SECRET_KEY=your_secret_key_here
     ```

### 2. Database Initialization
To populate the database with initial data from CSVs:
1. **Test Connection**:
   ```bash
   python backend/test_db.py
   ```
2. **Run Migration**:
   ```bash
   python backend/migrate_data.py
   ```
3. **Verify Migration**:
   ```bash
   python backend/verify_migration.py
   ```

### 3. Frontend Setup
1. **Navigate to frontend**:
   ```bash
   cd frontend
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Start Development Server**:
   ```bash
   npm run dev
   ```
4. **Open App**: Visit `http://localhost:5173` in your browser.

---

## 📚 Key Concepts & Glossary

### What does "Rebuild API using PostgreSQL" mean?
During the prototyping phase, the backend APIs (like `/workers` or `/bookings`) likely read data directly from static `.csv` files. 

**Rebuilding the API** means:
1. **Replacing CSV logic**: Removing `pandas.read_csv()` or `csv.reader()` calls within the API endpoints.
2. **Implementing DB Queries**: Using **SQLAlchemy** to query the PostgreSQL database.
3. **Data Validation**: Integrating **Pydantic** schemas to ensure data coming from the DB matches what the frontend expects.
4. **Dynamic Updates**: Enabling the API to handle `POST`, `PUT`, and `DELETE` requests that update the database in real-time, which was not possible with static CSV files.

---

## 🛠️ Quick Summary of Commands
| Task | Local Command | Docker Command |
| :--- | :--- | :--- |
| **Start All** | (Start backend & frontend separately) | `docker-compose up` |
| **Backend Dev** | `python backend/main.py` | `docker exec -it kk_backend ...` |
| **Frontend Dev** | `npm run dev` | `docker exec -it kk_frontend ...` |
| **Migration** | `python backend/migrate_data.py` | `docker exec -it kk_backend python migrate_data.py` |
