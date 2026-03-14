# Image translate service

https://cloud.yandex.ru/docs/serverless-containers/quickstart/container

```sh
curl -sSL https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
yc init

yc container registry create --name nezort11-registry

# CONFIGURE DOCKER FOR NON-ROOT
# https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user

yc container registry configure-docker

yc serverless container create --name $CONTAINER_ID

# yc container image list
# docker image ls
# REGISTRY_ID="$(yc container registry get nezort11-registry | grep -oP '^id: \K\w+')"
# yc serverless container list

# DOCKER HOST MUST BE LINUX/AMD64 OR DARWIN/AMD64
./run.sh docker build image_translate && ./run.sh docker:image:clean

CONTAINER_ID="image-translate"
REGISTRY_ID="crpo38kbrng93vsp6bkh"
SERVICE_ACCOUNT_ID="ajevtgbreai4dfnp9je3"

docker image tag $CONTAINER_ID "cr.yandex/${REGISTRY_ID}/${CONTAINER_ID}:latest"
docker image push "cr.yandex/${REGISTRY_ID}/${CONTAINER_ID}:latest"

# deploy container with compose.yml-like configuration
yc serverless container revision deploy \
  --container-name $CONTAINER_ID \
  --image "cr.yandex/${REGISTRY_ID}/${CONTAINER_ID}:latest" \
  --service-account-id $SERVICE_ACCOUNT_ID \
  --cores 2 \
  --memory 4GB \
  --concurrency 1 \
  --execution-timeout 10m \
  --command 'pnpm,start' \
  --environment 'CHROME_USER_DATA_DIR="./chrome_user_data"'

# Ubuntu 18.04 LTS
# AMD64 (x86_64)



# MAKE PUBLIC CONTAINER

```
