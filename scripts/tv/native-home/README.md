# Native Home

By default the remote's Home button opens Samsung's own Home. This optional
helper tells the TV to open Zeno instead. It is a one-shot tool run from the
computer: nothing stays running on the TV.

It is deliberately narrow. `run.py` and `Control.cs` check the exact model and
firmware they were tested on (Samsung QE65S90DATXZT) and refuse anything else.
Adapting it to another TV means changing those checks and testing again.

```sh
python3 scripts/tv/native-home/run.py query     # read the current values
python3 scripts/tv/native-home/run.py apply     # make Home open Zeno
python3 scripts/tv/native-home/run.py restore   # put the original values back
```

Before the first `apply`, the helper saves the TV's original values in
`.local/native-home/original.json`. Keep that file safe and never overwrite it:
it is the only way back to the factory behaviour. Restore before uninstalling
Zeno or changing its app identity.

The helper uses the developer connection (SDB) and runs as the SDK user. It does
not need root. Build the C# part with the .NET SDK kept in `.local/`:

```sh
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_CLI_HOME="$PWD/.local/native-home/cli" \
  .local/dotnet-sdk/dotnet build scripts/tv/native-home/Control.csproj -c Release \
  -p:BaseIntermediateOutputPath="$PWD/.local/native-home/obj/" -o .local/native-home/out
```

Firmware updates can change the underlying settings. Run `query` after every
update before trusting the Home button again.
