# RecoverIA Real-Data Mode

Default is `SYNTHETIC`. File presence never activates real-data behavior. Future local Client Zero mode requires all three values:

```text
RECOVERIA_DATA_MODE=client-zero
RECOVERIA_CLIENT_ZERO_ACK=I_UNDERSTAND_REAL_DATA_IS_SENSITIVE
RECOVERIA_CLIENT_ZERO_PATH=<repo>/.private/client-zero/inbox
```

The resolved path must remain below the designated boundary. Missing acknowledgement or an external path fails closed. Exit by unsetting all three variables and verify mode returns SYNTHETIC. These controls enable only mode selection; Phase 4.6 authorization is still separately required.
