import os
from huggingface_hub import HfApi, login, add_space_secret

token = os.getenv("HUGGING_FACE_TOKEN", "your_hugging_face_token")
login(token)

repo_id = "abhiram065/medicine_suggestor"

print("Adding secrets...")
add_space_secret(repo_id, "GEMINI_API_KEY", os.getenv("GEMINI_API_KEY", "your_gemini_api_key"))
add_space_secret(repo_id, "GEMINI_MODEL", "gemini-flash-latest")

print("Secrets added. Restarting space to apply secrets...")
api = HfApi()
api.restart_space(repo_id)
print("Space restarted successfully!")
