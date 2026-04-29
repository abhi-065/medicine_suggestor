# MedIntel Quick+

![MedIntel Quick+ Banner](https://via.placeholder.com/1200x400?text=MedIntel+Quick+)

**MedIntel Quick+** is a comprehensive full-stack web application designed to empower users with quick and reliable medicine insights. It features prescription OCR, detailed medicine analysis, web-searched alternatives, nearby pharmacy discovery via OpenStreetMap, and an intelligent AI chat assistant powered by the Gemini API.

## 🚀 Features

- **📄 Prescription OCR**: Effortlessly extract text from uploaded prescription images using robust offline OCR (`RapidOCR-ONNXRuntime`).
- **💊 Medicine Analysis & Alternatives**: Understand medicine uses, side effects, and explore potential alternatives using AI-driven analysis.
- **🏥 Nearby Pharmacies**: Quickly locate nearby medical stores and pharmacies based on your location via OpenStreetMap integration.
- **💬 AI Chat Assistant**: Ask health, medicine, and wellness-related queries through the integrated Gemini-powered chat assistant.
- **⚡ Modern & Responsive UI**: Built with React 19, Tailwind CSS, and Framer Motion for a seamless, beautiful user experience.
- **🐳 Dockerized for Easy Deployment**: Fully containerized multi-stage Docker setup, optimized for Hugging Face Spaces deployment.

---

## 🛠️ Technology Stack

**Frontend:**
- [React 19](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)
- [Lucide React](https://lucide.dev/)
- React Router DOM & React Markdown

**Backend:**
- [FastAPI](https://fastapi.tiangolo.com/)
- [Python 3.11](https://www.python.org/)
- [Uvicorn](https://www.uvicorn.org/) / Gunicorn
- [RapidOCR (ONNX)](https://github.com/RapidAI/RapidOCR)
- [Pillow](https://python-pillow.org/)

**AI / Integrations:**
- Google Gemini API
- OpenStreetMap API

---

## 📂 Project Structure

```text
medicine_suggestor/
├── backend/            # FastAPI backend, routing, endpoints, and OCR logic
├── frontend/           # React frontend, UI components, pages, and styling
├── Dockerfile          # Multi-stage Docker build for deploying the full app
├── upload_hf.py        # Script to automate deployment to Hugging Face Spaces
└── add_secrets.py      # Utility script for Hugging Face secrets
```

---

## ⚙️ Prerequisites

- **Node.js** (v20+ recommended)
- **Python** (v3.11+ recommended)
- **Git**
- **Docker** (optional, for containerized running)

---

## 💻 Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/medicine_suggestor.git
cd medicine_suggestor
```

### 2. Backend Setup

```bash
cd backend
# Create a virtual environment
python -m venv .venv

# Activate the virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure Environment Variables
cp .env.example .env
```

**Edit your `backend/.env` file:**
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
REQUEST_TIMEOUT_SEC=8
CORS_ORIGINS=http://localhost:5173
APP_USER_AGENT=MedIntelQuickPlus/1.0
```

**Start the backend server:**
```bash
uvicorn app.main:app --reload --port 8000
```
The API will be running at `http://localhost:8000`.

### 3. Frontend Setup

Open a new terminal window:

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```
The frontend will be running at `http://localhost:5173`.

---

## 🐳 Running with Docker

You can run the entire application (frontend and backend) seamlessly using Docker. The Dockerfile uses a multi-stage build to compile the frontend and serve it statically via FastAPI.

```bash
# Build the Docker image
docker build -t medintel-quick-plus .

# Run the container
docker run -p 7860:7860 --env-file backend/.env medintel-quick-plus
```
Access the application at `http://localhost:7860`.

---

## ☁️ Deployment (Hugging Face Spaces)

This project is configured for one-click deployments to Hugging Face Spaces using the Docker SDK.

1. Create a Docker Space on Hugging Face.
2. Add your `GEMINI_API_KEY` to the Space's Secrets.
3. Run the deployment script:

```bash
python upload_hf.py
```
*(Make sure to configure your `HUGGING_FACE_TOKEN` inside the script or as an environment variable before running).*

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/your-username/medicine_suggestor/issues) if you want to contribute.

## 📝 License

This project is licensed under the [MIT License](LICENSE).
