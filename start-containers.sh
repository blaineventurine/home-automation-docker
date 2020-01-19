#!/bin/bash
docker network inspect traefik_proxy >/dev/null 2>&1 || \
  docker network create traefik_proxy

COMPOSE_HTTP_TIMEOUT=120 docker-compose -f docker-compose.networks.yml \
  -f docker-compose.utilities.yml \
  -f docker-compose.databases.yml \
  -f docker-compose.proxy-services.yml \
  -f docker-compose.smarthome.yml \
  -f docker-compose.information-mangement.yml \
  -f docker-compose.media-management.yml up -d\
$@