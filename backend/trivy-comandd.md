Online 

docker build --no-cache --progress=plain \
  -f Dockerfile.online \
  --secret id=npmrc,src=.npmrc \
  -t notificaciones:online .


mkdir -p docs/evidencias

trivy image --scanners vuln --severity LOW,MEDIUM,HIGH,CRITICAL \
  notificaciones:online \
  > docs/evidencias/trivy-container-online.txt