import uvicorn
from fastapi import FastAPI
from api.routes import router

app = FastAPI(title="Liquidity Orchestrator ML Service")

app.include_router(router)

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
