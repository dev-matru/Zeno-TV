set -eu
printf 'ZENO_HOME_INSPECT_BEGIN\n'
/usr/bin/dotnet /home/owner/share/tmp/sdk_tools/ZenoHomeControl.dll restore /home/owner/share/tmp/sdk_tools/ZenoHomeOriginal.json __ZENO_APP__
printf 'ZENO_HOME_INSPECT_END\n'
