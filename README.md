# PAP Tax Charts

Interactive Vite + React app for exploring local German PAP 2026 payroll tax calculations.

The app calculates locally from the TypeScript PAP implementation, so graphing many points does not call the BMF API. BMF/API and Java PAP checks remain available as validation helpers.

## Quick Start

```powershell
npm install
npm run dev
```

Open the local Vite URL, usually `http://127.0.0.1:5173/`.

## Scripts

```powershell
npm run build
npm test -- --run --dir src/lib --reporter verbose
```

## Validation Helpers

The Java oracle and HTTP wrapper live in `tools/lohnservice`.

To run the comparison harness with the local Java service:

```powershell
$java='C:\Users\janli\jdk21\java-21-openjdk-21.0.4.0.7-1.win.jdk.x86_64\bin\java.exe'
$env:LOHSERVICE='1'
$env:LOHSERVICE_HTTP='1'
$env:LOHSERVICE_HTTP_PORT='8081'
Start-Process -FilePath $java -ArgumentList @('-cp','tools\lohnservice\lohnservice-server.jar;tools\lohnservice\lohnpap-local.jar;tools\lohnservice','LoServiceServer','8081')
npm test -- --run --dir src/lib --reporter verbose
```

The validation harness can write comparison CSVs under `tools/lohnservice/`.
