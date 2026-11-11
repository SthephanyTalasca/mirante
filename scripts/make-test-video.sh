#!/usr/bin/env bash
# Gera um vídeo sintético 1280x720 de 40 s em galeria 2x2 para o teste de ponta a ponta:
# host = quadrante VERMELHO (sup. esq.), P1 azul com movimento, P2 verde estático até 20 s, P3 preto (câmera desligada).
set -euo pipefail
mkdir -p /tmp/mtest
ffmpeg -hide_banner -loglevel error -y \
 -f lavfi -i "color=c=black:s=1280x720:d=40:r=25" \
 -f lavfi -i "testsrc2=s=160x120:r=25:d=40" \
 -f lavfi -i "color=c=white:s=150x150:r=25:d=40" \
 -filter_complex "[0]drawbox=x=0:y=0:w=640:h=360:color=red:t=fill,drawbox=x=640:y=0:w=640:h=360:color=0x2050ff:t=fill,drawbox=x=0:y=360:w=640:h=360:color=0x20a040:t=fill[bg];[1]split[a][b];[bg][a]overlay=x='mod(t*100\,480)':y=100[v1];[v1][b]overlay=x='700+mod(t*60\,400)':y=120[v2];[v2][2]overlay=x='if(lt(t\,20)\,100\,300)':y=450[out]" \
 -map "[out]" -t 40 -pix_fmt yuv420p /tmp/mtest/meeting.mp4
echo "/tmp/mtest/meeting.mp4"
