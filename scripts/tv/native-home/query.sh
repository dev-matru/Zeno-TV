set -eu
printf 'CASA_HOME_INSPECT_BEGIN\n'
/usr/bin/dotnet /home/owner/share/tmp/sdk_tools/CasaHomeControl.dll query
printf 'CASA_HOME_INSPECT_END\n'
