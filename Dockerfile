FROM python:3.13-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy pure Python application codebase
COPY schema ./schema
COPY agent ./agent
COPY data_preprocessing ./data_preprocessing
COPY recommendation ./recommendation
COPY kyc_verification ./kyc_verification
COPY order_tracking ./order_tracking
COPY database ./database
COPY frontend ./frontend
COPY data ./data
COPY YTL_TrackA_Udyam_Digital_Data ./YTL_TrackA_Udyam_Digital_Data
COPY main.py ./

ENV PORT=8000
EXPOSE 8000

CMD ["python", "main.py"]
