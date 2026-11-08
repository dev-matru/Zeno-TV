set -u
printf 'ZENO_HOME_INSPECT_BEGIN\n'
grep -q 'Version=T-PTMDDEUC-0090-2130.0;' /etc/prd_info.ini || exit 3
/usr/bin/app_launcher -t __ZENO_APP__ 2>&1
/usr/bin/app_launcher -w -s __ZENO_APP__ 2>&1
printf 'ZENO_HOME_INSPECT_END\n'
