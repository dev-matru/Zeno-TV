set -u
printf 'CASA_HOME_INSPECT_BEGIN\n'
/usr/bin/app_launcher -s __ZENO_APPID__ 2>&1
printf 'CASA_HOME_INSPECT_END\n'
