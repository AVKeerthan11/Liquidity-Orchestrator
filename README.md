# Liquidity-Orchestrator


//My device(AV)
set "JAVA_HOME=C:\Program Files\Java" && mvnw.cmd spring-boot:run
$env:JAVA_HOME="C:\Program Files\Java"; .\mvnw.cmd spring-boot:run


Method to run the springboot server:
Navigatee to backend/jbackend directory 
run : mvnw.cmd spring-boot:run( cmd terminal )
run : .\mvnw.cmd spring-boot:run( powershell )

Method to run python ml service(Switch to another terminal)
pre requisites: (Check for python environment using "python --version")

Navigate To ml-service Folder
cd Liquidity-Orchestrator\ml-service

run : python -m venv venv (Creates virtual env)
run : venv\Scripts\activate

Install libraries : pip install fastapi uvicorn pandas numpy scikit-learn xgboost prophet networkx psycopg2-binary sqlalchemy python-dotenv requests

Run ML Service : python main.py




