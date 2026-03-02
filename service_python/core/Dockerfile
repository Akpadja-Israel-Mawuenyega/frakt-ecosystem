# service_python/core/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install Gateway-specific dependencies
# Note: pymysql is vital for your XAMPP connection!
RUN pip install --no-cache-dir fastapi uvicorn httpx sqlalchemy pymysql slowapi pydantic pydantic-settings numpy scikit-learn

# Copy everything from the core folder into /app
COPY . /app/

# Run main.py
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]