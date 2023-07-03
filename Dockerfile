# Base image
FROM node:14-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY ./src ./src

# Expose the API port
EXPOSE 3000

# Start the API server
CMD ["npx", "nodemon", "src/server.js"]