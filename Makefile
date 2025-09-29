.PHONY: install build lint test run down

install:
	npm install --prefix knowledgeGraph
	npm run build --prefix knowledgeGraph
	npm install --prefix backend
	npm install --prefix frontend

build:
	npm run build

lint:
	npm run lint

test:
	npm run test

run:
	docker compose up --build

down:
	docker compose down
