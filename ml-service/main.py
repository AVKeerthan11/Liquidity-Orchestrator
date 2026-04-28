import uvicorn
from fastapi import FastAPI

try:
    from api.routes import router
    routes_available = True
except ImportError as e:
    print(f"WARNING: Could not import routes: {e}")
    print("Run: pip install -r requirements.txt")
    routes_available = False
    router = None

app = FastAPI(title="Liquidity Orchestrator ML Service")

if routes_available and router:
    app.include_router(router)

@app.get("/health")
def health_check():
    return {"status": "ok", "routes_available": routes_available}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
