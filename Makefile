up:
	docker-compose up

up-d:
	docker-compose up -d

down:
	docker-compose down

up-prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up
