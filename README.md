# yandex-voice-translate-bot

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
