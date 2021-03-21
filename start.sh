#!/bin/bash -i

tmux new-session -d -s geth
tmux send-keys -t geth "geth --config /home/haydenshively/Developer/New-Bedford/geth.toml" ENTER

tmux new-session -d -s newbedford-txm
tmux send-keys -t newbedford-txm "sleep 60 && yarn --cwd /home/haydenshively/Developer/New-Bedford/services/txmanager yarn start" ENTER

tmux new-session -d -s newbedford-del
tmux send-keys -t newbedford-del "sleep 65 && yarn --cwd /home/haydenshively/Developer/New-Bedford/services/delegator yarn start" ENTER
