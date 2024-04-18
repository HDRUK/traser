# Base image
FROM node:14-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install \
    && npm install @google-cloud/pubsub

# Copy source files
COPY . .

# Expose the API port
EXPOSE 3001

# Start the API server in dev
CMD ["npm","run","dev"]