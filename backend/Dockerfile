# Imagen del backend de CanchaYa (Render la construye desde este Dockerfile)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Primero dependencias (se cachean si requirements.txt no cambia)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Luego el código
COPY app ./app

# Usuario sin privilegios por seguridad
RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

# Render inyecta $PORT; en local se usa 8000.
# --proxy-headers: toma la IP real del cliente de X-Forwarded-For (Render está detrás de un proxy),
# necesario para que el rate limit cuente por usuario y no por el proxy.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
