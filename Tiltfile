## Gateway Traser Service Tiltfile
##
## Loki Sinclair <loki.sinclair@hdruk.ac.uk>
##

cfg = read_json('tiltconf.json')

docker_build(
    ref='hdruk/' + cfg.get('name'),
    context='.',
    live_update=[
        sync('.', '/app'),
        run('npm install', trigger='./package.json'),
    ]
)

k8s_yaml('chart/' + cfg.get('name') + '/deployment.yaml')
k8s_yaml('chart/' + cfg.get('name') + '/service.yaml')
k8s_resource(
    cfg.get('name'),
    port_forwards=8002
)
