set -u
printf 'CASA_HOME_INSPECT_BEGIN\n'
grep -q 'Version=T-PTMDDEUC-0090-2130.0;' /etc/prd_info.ini || exit 3
/usr/bin/app_launcher -s CsTv9rK2mQ.CasaTV 2>&1
printf 'CASA_HOME_INSPECT_END\n'
