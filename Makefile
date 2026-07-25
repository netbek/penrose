ifneq ($(shell which tput),)
	ifneq ($(TERM),)
		RED    := $(shell tput setaf 1)
		GREEN  := $(shell tput setaf 2)
		YELLOW := $(shell tput setaf 3)
		CYAN   := $(shell tput setaf 6)
		RESET  := $(shell tput sgr0)
	endif
endif

# ==============================================================================
# DEPENDENCY MANAGEMENT
# ==============================================================================

deps-scan:
	@echo "$(YELLOW)Scanning root lockfiles for vulnerabilities...$(RESET)"
	trivy fs pnpm-lock.yaml --table-mode detailed

repo-scan:
	@echo "$(YELLOW)Scanning entire repository for vulnerabilities...$(RESET)"
	trivy fs .

node-outdated:
	@echo "$(YELLOW)Listing outdated Node dependencies...$(RESET)"
	@pnpm outdated || true

node-upgrade: PACKAGE := $(word 2,$(MAKECMDGOALS))
node-upgrade:
	@if [ -z "$(PACKAGE)" ]; then \
		echo "$(YELLOW)Upgrading all Node dependencies...$(RESET)"; \
		pnpm exec ncu --packageManager pnpm --install always; \
	else \
		echo "$(YELLOW)Upgrading '$(PACKAGE)'...$(RESET)"; \
		pnpm exec ncu $(PACKAGE) --packageManager pnpm --install always; \
	fi

# Prevent make from treating arguments to node-upgrade as targets
ifeq (node-upgrade,$(firstword $(MAKECMDGOALS)))
%:
	@:
endif

node-why: PACKAGE := $(word 2,$(MAKECMDGOALS))
node-why:
	@if [ -z "$(PACKAGE)" ]; then \
		echo "$(RED)Error: Package name is required.$(RESET)"; \
		echo "Usage: make node-why <package>"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Listing Node dependencies of '$(PACKAGE)'...$(RESET)"
	pnpm why $(PACKAGE)

# Prevent make from treating arguments to node-why as targets
ifeq (node-why,$(firstword $(MAKECMDGOALS)))
%:
	@:
endif

# ==============================================================================
# FORMAT
# ==============================================================================

format:
	@echo "Formatting code..."
	pre-commit run format-js --all-files

# ==============================================================================
# PUBLISH
# ==============================================================================

bump-version:
	@BUMP=$(word 2,$(MAKECMDGOALS)); \
	VALID_BUMP="major minor patch premajor preminor prepatch prerelease"; \
	if [ -z "$$BUMP" ]; then \
		echo "$(RED)Error: Bump is required.$(RESET)"; \
		echo "Usage: make bump-version [major|minor|patch|premajor|preminor|prepatch|prerelease]"; \
		exit 1; \
	fi; \
	if ! echo "$$VALID_BUMP" | grep -qw "$$BUMP"; then \
		echo "$(RED)Error: Invalid bump '$$BUMP'.$(RESET)"; \
		echo "Must be one of: $(CYAN)$$VALID_BUMP$(RESET)"; \
		exit 1; \
	fi; \
	pnpm version $$BUMP;

create-release:
	@VERSION=$$(pnpm pkg get version --browser=false | tr -d '"'); \
	gh release create $$VERSION; \
	git fetch --tags;

publish:
	pnpm publish

# Prevent make from treating arguments to bump-version as targets
ifeq (bump-version,$(firstword $(MAKECMDGOALS)))
%:
	@:
endif
