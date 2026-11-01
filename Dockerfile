FROM node:22-alpine

WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code and frontend
COPY node-src ./node-src
COPY frontend ./frontend
COPY server.js ./
COPY YTL_TrackA_Udyam_Digital_Data ./YTL_TrackA_Udyam_Digital_Data

# Set environment
ENV PORT=8000
EXPOSE 8000

# Start server
CMD ["node", "server.js"]
