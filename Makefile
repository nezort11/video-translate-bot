# ==========================================
# Video Translate Bot - Management Makefile
# ==========================================

# Variables
PACKAGE_DIR = packages/video-translate-bot
COMPOSE_FILE = $(PACKAGE_DIR)/compose.yaml
COMPOSE = docker compose -f $(COMPOSE_FILE)
PROJECT_NAME = vtb

# Colors for pretty output
GREEN  := $(shell tput -Txterm setaf 2)
YELLOW := $(shell tput -Txterm setaf 3)
WHITE  := $(shell tput -Txterm setaf 7)
CYAN   := $(shell tput -Txterm setaf 6)
RESET  := $(shell tput -Txterm sgr0)

.PHONY: help up down restart build rebuild logs bot-logs worker-logs ps shell db clean init env-pull env-push deploy status

help: ## Show this help menu
	@echo ''
	@echo '${CYAN}Video Translate Bot Management${RESET}'
	@echo ''
	@echo 'Usage:'
	@echo '  ${YELLOW}make${RESET} ${GREEN}<target>${RESET}'
	@echo ''
	@echo 'Targets:'
	@awk '/^[a-zA-Z\-_0-9]+:.*?##/ { \
		helpMessage = match($$0, /## (.*)/); \
		if (helpMessage) { \
			helpCommand = substr($$0, 0, index($$0, ":")-1); \
			helpMessage = substr($$0, RSTART + 3, RLENGTH); \
			printf "  ${YELLOW}%-15s${RESET} ${GREEN}%s${RESET}\n", helpCommand, helpMessage; \
		} \
	}' $(MAKEFILE_LIST)
	@echo ''

# --- Docker Orchestration ---

up: ## Start all services in detached mode
	@echo "${CYAN}🚀 Starting services...${RESET}"
	$(COMPOSE) up -d

down: ## Stop and remove containers, networks
	@echo "${YELLOW}🛑 Stopping services...${RESET}"
	$(COMPOSE) down

restart: ## Restart all services
	@echo "${CYAN}🔄 Restarting services...${RESET}"
	$(COMPOSE) restart

build: ## Build services (standard)
	@echo "${CYAN}🏗️  Building images...${RESET}"
	$(COMPOSE) build

rebuild: ## Build services without cache
	@echo "${CYAN}🏗️  Rebuilding images (no cache)...${RESET}"
	$(COMPOSE) build --no-cache

logs: ## View output from all containers
	$(COMPOSE) logs -f

bot-logs: ## View logs for the bot service
	$(COMPOSE) logs -f bot

worker-logs: ## View logs for the worker service
	$(COMPOSE) logs -f worker

ps: ## List running containers and status
	$(COMPOSE) ps

status: ps ## Alias for ps

shell: ## Open a bash shell in the bot container
	$(COMPOSE) exec bot bash

db: ## Open a postgres shell inside the container
	$(COMPOSE) exec postgres psql -U vtb_user -d vtb_db

clean: ## Deep clean: remove containers, volumes, and images
	@echo "${YELLOW}🧹 Cleaning up everything (containers, volumes, images)...${RESET}"
	$(COMPOSE) down --rmi all --volumes --remove-orphans

# --- Application Management ---

init: ## Run bot initialization (database setup, etc.) inside container
	@echo "${CYAN}⚙️  Running bot initialization...${RESET}"
	$(COMPOSE) exec bot pnpm run bot:init

env-pull: ## Pull environment files from S3/RClone
	@echo "${CYAN}📥 Pulling environment files...${RESET}"
	pnpm bot:env:pull

env-push: ## Push environment files to S3/RClone
	@echo "${CYAN}📤 Pushing environment files...${RESET}"
	pnpm bot:env:push

# --- Deployment & Local Dev ---

deploy: ## Deploy the bot to Yandex Cloud (using Terraform)
	@echo "${CYAN}🚢 Deploying to cloud...${RESET}"
	pnpm bot:deploy:bundle

dev: ## Start local development (non-docker, using pnpm)
	@echo "${CYAN}💻 Starting local development...${RESET}"
	pnpm bot:dev

tf: ## Run terraform commands (e.g., make tf cmd=plan)
	pnpm tf $(cmd)
