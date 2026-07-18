from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from innsight_model import MODEL_VERSION

app = FastAPI(title="INNSIGHT API", version=MODEL_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model_version": MODEL_VERSION}
