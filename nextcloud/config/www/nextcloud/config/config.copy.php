<?php
$CONFIG = array (
  'memcache.local' => '\\OC\\Memcache\\Redis',
  'datadirectory' => '/data',
  'instanceid' => 'REDACTED',
  'passwordsalt' => 'REDACTED',
  'secret' => 'REDACTED',
  'trusted_domains' => 
  array (
    0 => 'local ip here:9443',
    1 => 'nextcloud.yourserver.com',
  ),
  'redis' => array(
    'host' => 'redis ip',
    'port' => 6379,
  ),
  'memcache.locking' => '\OC\Memcache\Redis',
  'dbtype' => 'mysql',
  'version' => '18.0.4.2',
  'overwrite.cli.url' => 'https://local ip:9443',
  'dbname' => 'nextcloud',
  'dbhost' => 'mariadb ip:3306',
  'dbport' => '',
  'dbtableprefix' => 'oc_',
  'mysql.utf8mb4' => true,
  'dbuser' => 'databse username',
  'dbpassword' => 'databse password',
  'installed' => true,
  'maintenance' => false,
  'theme' => '',
  'loglevel' => 2,
  'app_install_overwrite' => 
  array (
    0 => 'calendar',
  ),
);
