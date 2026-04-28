import os
from huggingface_hub import HfApi, login

# Set your Hugging Face Token here or read from environment variable
token = os.getenv("HUGGING_FACE_TOKEN", "your_hugging_face_token")

api = HfApi()

repo_id = "abhiram065/medicine_suggestor"
print(f"Creating or verifying space: {repo_id}")
api.create_repo(repo_id=repo_id, repo_type="space", space_sdk="docker", exist_ok=True)

print("Uploading backend...")
api.upload_folder(
    folder_path="backend",
    path_in_repo="backend",
    repo_id=repo_id,
    repo_type="space",
    ignore_patterns=["venv/**", ".venv/**", "__pycache__/**", ".env*"]
)

# print("Uploading frontend...")
# api.upload_folder(
#     folder_path="frontend",
#     path_in_repo="frontend",
#     repo_id=repo_id,
#     repo_type="space",
#     ignore_patterns=["node_modules/**", "dist/**", "build/**"]
# )

# print("Uploading Dockerfile...")
# api.upload_file(
#     path_or_fileobj="Dockerfile",
#     path_in_repo="Dockerfile",
#     repo_id=repo_id,
#     repo_type="space"
# )

print("Upload complete!")
