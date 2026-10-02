Raspberry pi

host: photo-pi
username: ming
Password: ferment-strongly-beard

cd my-app
npm install
cp .env.local.example .env.local
npx next dev
Then http://localhost:3000/booth


### shutdown
ssh ming@photo-pi.local
sudo shutdown -h now

### start with convex
ssh ming@photo-pi.local
ferment-strongly-beard

cd ~/booth

CONVEX_URL=https://jovial-bullfrog-243.convex.cloud \
CONVEX_SITE_URL=https://jovial-bullfrog-243.convex.site \
BOOTH_SECRET=shaban-likes-boys \
COUNTDOWN_MS=0 \
node pi-listener.mjs


### change network
# connect ethernet cable

ssh ming@photo-pi.local
ferment-strongly-beard

## wifi set to
sudo nmcli dev wifi connect "TELUS9050" password "zKFLt9krB843"

### scp
scp -r ming@photo-pi.local:'~/ai-photobooth/booth/' ~/Desktop/


## Flash pi scripts
curl -fsSL https://raw.githubusercontent.com/isaak1294/photobooth/main/pi/deploy-to-pi.sh | bash
sudo systemctl restart booth-print 
journalctl -u booth-print -f

## just take photo 
rpicam-still -o ~/test.jpg -t 2000 -n

## download to mac
scp ming@photo-pi.local:~/test.jpg ~/Desktop/
open ~/Desktop/test.jpg
