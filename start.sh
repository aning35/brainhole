#!/bin/bash

# Brainhole Canvas - Local Development Startup Script
# Features: Check port conflicts, kill processes, start development server

set -e  # Exit on error

# Configuration
PORT=4890
APP_NAME="Brainhole Canvas"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}[$(date '+%H:%M:%S')] ${message}${NC}"
}

# Check if in project root
check_project_root() {
    if [[ ! -f "package.json" ]]; then
        print_message $RED "Error: Please run this script in the project root directory"
        exit 1
    fi
    
    if [[ ! $(grep -q "brainhole-canvas" package.json) ]]; then
        print_message $YELLOW "Warning: The current directory might not be the correct project directory"
    fi
}

# Check required software
check_software() {
    if ! command -v node &> /dev/null; then
        print_message $RED "Error: Node.js is not installed. Please visit https://nodejs.org/ to install."
        exit 1
    fi
    
    if ! command -v uv &> /dev/null; then
        print_message $RED "Error: uv is not installed. Please visit https://docs.astral.sh/uv/ to install."
        exit 1
    fi
}

# Check port status
check_port() {
    local port=$1
    local pid=$(lsof -ti:$port -sTCP:LISTEN 2>/dev/null)
    
    if [[ -n "$pid" ]]; then
        print_message $YELLOW "Port $port is occupied by process $pid"
        
        # Get process info
        local process_info=$(ps -p $pid -o comm= 2>/dev/null || echo "Unknown Process")
        print_message $BLUE "Process info: $process_info (PID: $pid)"
        
        return 0  # Port occupied
    else
        print_message $GREEN "Port $port is available"
        return 1  # Port not occupied
    fi
}

# Kill process occupying the port
kill_port_process() {
    local port=$1
    local pids=$(lsof -ti:$port -sTCP:LISTEN 2>/dev/null)
    
    if [[ -n "$pids" ]]; then
        print_message $YELLOW "Killing process occupying port $port..."
        
        # Try graceful shutdown
        echo $pids | xargs kill -TERM 2>/dev/null || true
        
        # Wait a second
        sleep 1
        
        # Check if process still exists
        local remaining_pids=$(lsof -ti:$port -sTCP:LISTEN 2>/dev/null)
        if [[ -n "$remaining_pids" ]]; then
            print_message $RED "Graceful shutdown failed, force killing process..."
            echo $remaining_pids | xargs kill -9 2>/dev/null || true
            sleep 1
        fi
        
        # Check again
        if check_port $port; then
            print_message $RED "Failed to clear port, please handle manually"
            exit 1
        else
            print_message $GREEN "Port $port successfully cleared"
        fi
    fi
}

# Check if dependencies are installed
check_dependencies() {
    if [[ ! -d "node_modules" ]]; then
        print_message $YELLOW "Dependencies not found, installing..."
        npm install
    fi
}

# Start dev server
start_dev_server() {
    print_message $BLUE "Starting $APP_NAME development server..."
    print_message $BLUE "Server will run at http://localhost:$PORT"
    
    # Start dev server
    npm run dev
}

# Cleanup function - called on script exit
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        print_message $RED "An error occurred during startup, exit code: $exit_code"
    fi
    exit $exit_code
}

# Show help information
show_help() {
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -f, --force    Force kill port process without asking"
    echo "  -h, --help     Show this help message"
    echo
    echo "Examples:"
    echo "  $0              # Normal startup (will ask if port is occupied)"
    echo "  $0 --force      # Force clear port and start"
}

# Process command line arguments
FORCE_KILL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE_KILL=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_message $RED "Unknown parameter: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main function handling force mode
main_with_force() {
    print_message $BLUE "🚀 Starting $APP_NAME Development Environment"
    echo
    
    # Set cleanup trap
    trap cleanup EXIT
    
    # Check project root
    check_project_root
    
    # Check software
    check_software
    
    # Check dependencies
    check_dependencies
    
    # Check and clear port
    if check_port $PORT; then
        if [[ "$FORCE_KILL" == "true" ]]; then
            print_message $YELLOW "Force mode: Automatically clearing port $PORT"
            kill_port_process $PORT
        else
            read -p "Do you want to kill the process occupying port $PORT? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                kill_port_process $PORT
            else
                print_message $YELLOW "User cancelled, exiting startup"
                exit 0
            fi
        fi
    fi
    
    # Start development server
    start_dev_server
}

# Run main function
main_with_force