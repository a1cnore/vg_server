FROM python:3.11-slim

RUN pip install --no-cache-dir mitmproxy==10.0.0

COPY *.py /app/
COPY entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

WORKDIR /app

EXPOSE 443 8000 2112 9000

ENTRYPOINT ["/app/entrypoint.sh"]
