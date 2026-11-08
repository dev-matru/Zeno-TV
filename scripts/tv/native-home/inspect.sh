set -u
printf 'CASA_HOME_INSPECT_BEGIN\n'
id
uname -m
sed -n '/^Model=/p; /^Version=/p' /etc/prd_info.ini
/usr/bin/buxton2ctl get system db/sdk/develop/ip
/usr/bin/buxton2ctl get system db/sdk/develop/mode
printf 'CASA_HOME_INSPECT_END\n'
