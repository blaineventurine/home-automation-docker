# Homelab Setup

This guide is very much a constant work in progress, more for my own sake so I don't forget how I set all of this up. I'm trying to document the various pitfalls I experienced, but I have no doubt that there are quite a few that slipped through. I started out running Pihole on a Raspberry Pi, but then I wanted to use Home Assistant to start automating things around my house, and then I needed to use Traefik to access it when I wasn't home and then suddenly the little Pi couldn't keep up. Currently everything is running on an old laptop with 16gb of RAM running Xubuntu 18.04.

These are all the containers I have running at home. Everything is run behind a Traefik reverse proxy, with SSL certificates.

Currently, I'm running:

* Traefik
* Home Assistant
* PiHole
* Organizr
* Portainer
* Mosquitto (an MQTT broker)
* MongoDB
* Home Assistant Docker Monitor
* InfluxDB
* Grafana
* Chronograf
* Node-RED
* MQTTBridge (to make Samsung SmartThings post to MQTT topics)
* Fail2Ban
* Nextcloud
* MaraiDB
* PHPMyAdmin
* Watchtower
* Duplicati (easiest backup solution I've found)

as containers, and my server has a Samba share set up to eventually allow access to media stored elsewhere on my network. I've configured my persistent container data to be shared, allowing me to edit config files from the comfort of my desktop without needing to SSH in, and having Samba set up is useful for Duplicati backups.

As far as devices, I'm using:

* Hue bulbs
* Amazon Echo/Echo Dot
* TP-Link Wifi Smart Plugs
* Samsung SmartThings
  * Hub
  * Contact Sensors
  * Outlets
  * Motion Detectors
* Sylvania ZigBee Outlets
* Yi Home Cams
* Assorted Raspberry Pi models 2 and 3 - some with temperature and light sensors, one as a wall-mounted touchscreen to act as a control panel for Home Assistant
* Samsung Galaxy Tab S - also a wall-mounted control panel, also has a few sensors I use
* Roku
* Chromecast
* Router running DD-WRT
* Nest Thermostat

The SmartThings hub only seems to work when the phase of the moon is just right, and if I had to do it over, I would go with a different platform.

I'm in the process of adding a Pi running OctoPrint (for controlling my 3D printer), a few ESP8266's that will post sensor data to an MQTT topic, some repurposed Amazon dash buttons, and a ton of NFC tags I'm trying to find uses for.



## Docker Setup

If you don't have Docker installed, follow the instuctions [here](https://docs.docker.com/install/linux/docker-ce/ubuntu/).

Having a specific Docker group is useful so you don't have to `sudo` everything, so after installation run

`sudo groupadd docker`  
`sudo usermod -aG docker $USER`

Then log out and back in. If you can `docker run hello-world` without needing `sudo`, you're good to go. If you still get permissions errors try  

`sudo chown "$USER":"$USER" /home/"$USER"/.docker -R`  
`sudo chmod g+rwx "$HOME/.docker" -R`  


Next, configure Docker to run on start up:  

`sudo systemctl enable docker`

Now install docker-compose:

`sudo curl -L "https://github.com/docker/compose/releases/download/1.23.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose`

modifying the version number to whatever is most recent. Next, create a docker network:

`docker network create traefik_proxy`

Then create a file, `.env`, which will store all the things you'd like to keep secret.

>PUID=  
PGID=  
TZ=  
USERDIR=   
MYSQL_ROOT_PASSWORD=  
MYSQL_PASSWORD=  
MYSQL_USER=  
MYSQL_DATABASE=  
HTTP_USERNAME=  
HTTP_PASSWORD=  
DOMAINNAME=  
CLOUDFLARE_EMAIL=  
CLOUDFLARE_API_KEY=  
PIHOLE_PASSWORD=  
LOCAL_IP=  
BACKUPPC_ADMIN_USER=  
BACKUPPC_ADMIN_PASS=  

`PUID` and `PGID` can be found on your system by running `id $user`.  
`TZ` is your current time zone  
`USERDIR` is the root directory where you could like your persistent container data stored. For me it's something like `/home/me/containers`  
`DOMAINNAME` is self-explanatory - `my-website.com` or whatever it is you own.  
`LOCALIP` is the local network address of your server.  

The rest of them can wait for now.

Cloudflare was by far the easiest to integrate with Traefik (and use wildcard certificates for subdomains) between the various DNS servers I tried - NameCheap, Google Domains, and Amazon - and this guide assumes that's what you're using.

Create a file, `docker-compose.yml` in the USERDIR you defined earlier. At the top of the file, with no indentation, add:

    version: '3'
    services:

I keep my networks defined at the bottom of the file like so:

    networks:  
      traefik_proxy:  
        external:  
          name: traefik_proxy
      default:
        driver: bridge

In between the `services` and the `networks` we'll define how our containers will be set up. First though, get Cloudlfare set up.

## Create .htpasswd

Traefik doesn't have any protection for the API or dashboard we're going to expose, so we need to take care of that first by creating a file called .htpasswd that contains a login name in plaintext, and the hash of a password. In this guide, I placed the file under my `${USERDIR}/shared/` directory. Open a terminal in that folder and type

`htpasswd -c .htpasswd username`

where `username` is whatever you want your login name to be. It'll prompt you for a password, and then create the file. When you login, you will use the password, not the hash, so don't lose it. Fill in the `HTTP_USERNAME` and `HTTP_PASSWORD` variables in your `.env` file with the values from `.htpasswd`.

## Configure Cloudflare

I don't have a need for dynamic DNS, so this guide won't cover it, but it is relatively easy to set up with Cloudflare
![Setup Cloudflare to redirect to the external IP of your server](./cloudflare.png " X")

You'll need your Global API key, so grab that and save it in your `.env` file.

You will eventually need to forward ports `80` and `443` to the local IP of your server, but that can wait until we have Traefik up an running.

## Traefik

Add this as a service to your `docker-compose.yml` file.

      traefik:
        hostname: traefik
        image: traefik:latest
        container_name: traefik
        restart: always
        volumes:
          - /var/run/docker.sock:/var/run/docker.sock:ro
          # create these toml files first
          - ${USERDIR}/traefik/traefik.toml:/etc/traefik/traefik.toml:ro
          - ${USERDIR}/traefik/rules.toml:/etc/traefik/rules.toml:ro
          - ${USERDIR}/traefik/acme:/etc/traefik/acme
          - ${USERDIR}/shared:/shared
          - ${USERDIR}/traefik/log:/var/log
        ports:
        - "80:80"
        - "443:443"
        - "8090:8080"
        networks:
          - default
          - traefik_proxy
        environment:
          - CLOUDFLARE_EMAIL=${CLOUDFLARE_EMAIL}
          - CLOUDFLARE_API_KEY=${CLOUDFLARE_API_KEY}
        command:
          - --web
          - --accessLog.filePath=/var/log/access.log
          - --accessLog.filters.statusCodes=400-499
        labels:
          - "traefik.enable=false"

At the top, we have

      traefik:
        hostname: traefik
        image: traefik:latest
        container_name: traefik
        restart: always

`image: traefik:latest` tells Docker to pull the image tagged with `latest` from `hub.docker.com`. Other hubs are available, as are other image versions - often, `latest` is a beta, or something not entirely suited for production. Feel free to leave the tag off. The `container_name` can be whatever you want, but for simplicity (since I am only running one of each), I usually keep it the same name as the service. The `restart` setting gives you a few different options: `unless-stopped`, `no`, `always`, and `on-failure`.

Next,

        volumes:
          - /var/run/docker.sock:/var/run/docker.sock:ro
          # create these toml files first
          - ${USERDIR}/traefik/traefik.toml:/etc/traefik/traefik.toml:ro
          - ${USERDIR}/traefik/rules.toml:/etc/traefik/rules.toml:ro
          - ${USERDIR}/traefik/acme:/etc/traefik/acme
          - ${USERDIR}/shared:/shared
          - ${USERDIR}/traefik/log:/var/log

tells Docker where the persistent data for the container will live. The best thing about Docker is that you can easily switch between versions of something by simply using a different image. If you're on version 1.1 of something, and 1.6 comes out, just pull the new image and throw away the old container. Your settings won't go anywhere. It helps to think of each container as a tiny little virtual machine, running only what it needs. We can map folders from there to the host machine, allowing us to persist configuration files and things like that. Everything that isn't mapped will disappear when the container is removed.  

The line `- /var/run/docker.sock:/var/run/docker.sock:ro` gives the container access to the host machine's UNIX socket, in read-only mode. Essentially this allows the container to exchange data between other processes on the host. Not needed for every container.

The next few lines allow us to keep our config and log files. Docker, by default, will create directories that don't exist already - in fact, it creates everything as a directory, even things that are supposed to be files. You'll need to change directories to you container root, then

`mkdir traefik`  
`mkdir traefik/acme`

followed by  

`touch traefik/traefik.toml && touch traefik/rules.toml && touch traefik/acme/acme.json`  

to create the files.

The next section,

        ports:
        - "80:80"
        - "443:443"
        - "8090:8080"

maps our access ports. `HostPort:ContainerPort` is the schema, so to access the port the container sees as `8080`, I type in `localhost:8090` in the host machine. For most containers, the host ports are arbitrary - except Traefik needs `80` and `443`, and PiHole will need `53`.  

Docker keeps containers fairly isolated from each other by default, so this section

        networks:
          - default
          - traefik_proxy

tells Docker to have this container join the network we created earlier.

This

        environment:
          - CLOUDFLARE_EMAIL=${CLOUDFLARE_EMAIL}
          - CLOUDFLARE_API_KEY=${CLOUDFLARE_API_KEY}

allows us to pass some default options into the container on startup, using variables defined in the `.env` file.

This

        command:
          - --web
          - --accessLog.filePath=/var/log/access.log
          - --accessLog.filters.statusCodes=400-499

overrides a few defaults, and tells the container to log certain status codes, which we will need when we set up Fail2Ban.

The labels section,

        labels:
          - "traefik.enable=true"
          - "traefik.backend=traefik"
          - "traefik.frontend.rule=Host:traefik.${DOMAINNAME}"  
          #- "traefik.frontend.rule=Host:${DOMAINNAME}; PathPrefixStrip: /traefik"
          - "traefik.port=8080"
          - "traefik.docker.network=traefik_proxy"
          - "traefik.frontend.headers.SSLRedirect=true"
          - "traefik.frontend.headers.STSSeconds=315360000"
          - "traefik.frontend.headers.browserXSSFilter=true"
          - "traefik.frontend.headers.contentTypeNosniff=true"
          - "traefik.frontend.headers.forceSTSHeader=true"
          - "traefik.frontend.headers.SSLHost=${DOMAINNAME}.com"
          - "traefik.frontend.headers.STSIncludeSubdomains=true"
          - "traefik.frontend.headers.STSPreload=true"
          - "traefik.frontend.headers.frameDeny=true"

is where Traefik works its magic.

First, we enable Traefik for this container.  

          - "traefik.enable=true"

Then, tell Traefik the name of the backend container

          - "traefik.backend=traefik"

Now, here is the subdomain you would like to use, so if you go to traefik.your-website.com, Traefik will look for that request and direct you to the appropriate container

          - "traefik.frontend.rule=Host:traefik.${DOMAINNAME}"  

If you are not using subdomains, and instead using a path, like your-website.com/traefik, then comment out the line above and uncomment this one.

          #- "traefik.frontend.rule=Host:${DOMAINNAME}; PathPrefixStrip: /traefik"

These next lines tell Traefik what internal port to use, what network the container is on, and then the rest are enough security headers to get an A+ rating from [SSLLabs](https://ssllabs.com)

          - "traefik.port=8080"
          - "traefik.docker.network=traefik_proxy"
          - "traefik.frontend.headers.SSLRedirect=true"
          - "traefik.frontend.headers.STSSeconds=315360000"
          - "traefik.frontend.headers.browserXSSFilter=true"
          - "traefik.frontend.headers.contentTypeNosniff=true"
          - "traefik.frontend.headers.forceSTSHeader=true"
          - "traefik.frontend.headers.SSLHost=${DOMAINNAME}.com"
          - "traefik.frontend.headers.STSIncludeSubdomains=true"
          - "traefik.frontend.headers.STSPreload=true"
          - "traefik.frontend.headers.frameDeny=true"

Now we can edit the `traefik.toml` file you created earlier.

### Traefik Configuration

    #debug = true

    logLevel = "ERROR" #DEBUG, INFO, WARN, ERROR, FATAL, PANIC
    InsecureSkipVerify = true
    defaultEntryPoints = ["https", "http"]

    # web interface
    [api]
      entryPoint = "traefik"
      dashboard = true

    # Force HTTPS
    [entryPoints]
      [entryPoints.http]
        address = ":80"
        [entryPoints.http.redirect]
        entryPoint = "https"
      [entryPoints.traefik]
        address = ":8080"
        [entryPoints.traefik.auth]
          [entryPoints.traefik.auth.basic]
            usersFile = "/shared/.htpasswd"
      [entryPoints.https]
      address = ":443"
      compress = true
        [entryPoints.https.tls]
          minVersion = "VersionTLS13"
          cipherSuites = [
            "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",
          ]

    [file]
      watch = true
      filename = "/etc/traefik/rules.toml"

    # Let's encrypt configuration
    [acme]
      email = "youremailaddress@email.com" #any email id will work
      storage="/etc/traefik/acme/acme.json"
      entryPoint = "https"
      acmeLogging=true
      onDemand = false #create certificate when container is created
    [acme.dnsChallenge]
      provider = "cloudflare"
      delayBeforeCheck = 0
    [[acme.domains]]
      main = "your-domain.com"
    [[acme.domains]]
      main = "*.your-domain.com"

    # Connection to docker host system (docker.sock)
    [docker]
      endpoint = "unix:///var/run/docker.sock"
      domain = "your-domain.com"
      watch = true
      # This will hide all docker containers that don't have explicitly  
      # set label to "enable"
      exposedbydefault = false

A lot of this should be pretty self-explanatory. Make sure to change the domains and email address to match yours. Some of these sections are left in from before I used Cloudflare, to allow for an HTTP challenge to issue an SSL certificate. I left them in just in case, as they don't hurt anything.  

Notice all of the paths are what your container will see - `"/etc/traefik/acme/acme.json"` instead of `- ${USERDIR}/traefik/acme:/etc/traefik/acme`

The `acme.json` file is where your private keys will live.

### Spin up the Container

 Go ahead and forward ports `80` and `443` on your router to the IP address of the host machine. In a console,in the same directory as the `docker-compose.yml` file, type `docker-compose up -d`. Docker will pull down the image, create the container, and start it up. You should be able to access the web interface from `traefik.your-domain.com`. If everything is working, `docker-compose down` will bring it to a stop. The `-d` flag is optional - it runs containers in 'detached' mode, where they run in the background. I like having a terminal window open for now, to view events as they happen, so I generally start containers without it.

## Fail2Ban

Now that we have a container up and running, a little more security is needed. Fail2Ban will block IP addresses associated with too many failed login attempts - or any IP that makes a request that generates a response in the 400-409 range. So even if someone is randomly querying things, hoping to find something exposed, after a pre-determined amount of 404s, they are banned.

Start by adding this to `docker-compose.yml`

    fail2ban:
      image: crazymax/fail2ban:latest
      network_mode: "host"
      cap_add:
      - NET_ADMIN
      - NET_RAW
      volumes:
      - ${USERDIR}/traefik/log:/var/log:ro
      - ${USERDIR}/fail2ban/data:/data

We don't need this to be accessible from the internet, so it's a pretty simple configuration. We're giving Fail2Ban access to the Traefik logs, in read-only mode. Next, we need to create a file called `traefik.conf` in `${USERDIR}/fail2ban/data/jail.d`. Make those directories, `touch` the file, and

    [traefik-auth]
    enabled = true
    logpath = /var/log/access.log
    port = http,https

that goes in it. Next, we need to tell Fail2Ban what to look for. Create another file, `${USERDIR}/fail2ban/data/filter.d/traefik-auth.conf` and put this

    [Definition]
    failregex = ^<HOST> \- \S+ \[\] \"(GET|POST|HEAD) .+\" 401 .+$
    ignoreregex =

in it. Make sure neither of those files are indented - Fail2Ban will complain.

## Portainer

Portainer a great web GUI to monitor and manage your Docker setup. You can start and stop containers, keep track of images, networks, volumes - all sorts of stuff. I find it useful also for viewing individual logs, and occasionally opening a terminal directly into a container.

    portainer:
      container_name: portainer
      restart: always  
      image: portainer/portainer:latest
      volumes:
        - ${USERDIR}/portainer:/data
        - ${USERDIR}/shared:/shared
        - /var/run/docker.sock:/var/run/docker.sock
      ports:
        - "9000:9000"
      environment:
        - TZ=${TZ}
      networks:
        - traefik_proxy
      labels:
        - "traefik.enable=true"
        - "traefik.port=9000"
        - "traefik.backend=portainer"
        - "traefik.frontend.rule=Host:portainer.${DOMAINNAME}"
        - "traefik.frontend.headers.SSLRedirect=true"
        - "traefik.frontend.headers.STSSeconds=315360000"
        - "traefik.frontend.headers.browserXSSFilter=true"
        - "traefik.frontend.headers.contentTypeNosniff=true"
        - "traefik.frontend.headers.forceSTSHeader=true"
        - "traefik.frontend.headers.SSLHost=${DOMAINNAME}.com"
        - "traefik.frontend.headers.STSIncludeSubdomains=true"
        - "traefik.frontend.headers.STSPreload=true"
        - "traefik.frontend.headers.frameDeny=true"

## Mosquitto

## HomeAssistant

## PiHole


