# video translate bot

<img height="512px" src="https://github.com/nezort11/video-translate-bot/assets/59317431/5a8eb1f1-a2ab-4359-a5f4-433dfc9f4f8b" />
<img height="512px" src="https://github.com/nezort11/video-translate-bot/assets/59317431/dc45aafd-152a-4631-a3fa-4170aae0c1d2" />

## Start

```sh
git pull
# make sure right owner are set correctly after
sudo chown -R pi:pi .
# make sure run.sh script is executable
chmod +x ./run.sh

# git update-index --chmod=+x ./run.sh

# don't use sudo, because root mode will break some docker-push/yc/aws stuff
# NOTE: without sudo docker user crontab stuff sometimes crashes...
./run.sh docker:build
./run.sh docker:up
```

## cli

```sh
url='https://youtu.be/x8J3a5ty3zw' pnpm cli
```
