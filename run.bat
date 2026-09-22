@echo off
title Sistem Peminjaman Ruangan Dinkes Gresik
echo Menjalankan server peminjaman ruangan...

WHERE node >nul 2>nul
IF %ERRORLEVEL% EQU 0 (
    node server.js
) ELSE (
    IF EXIST "C:\Program Files\nodejs\node.exe" (
        "C:\Program Files\nodejs\node.exe" server.js
    ) ELSE (
        echo Node.js tidak ditemukan di PATH ataupun di C:\Program Files\nodejs\
        pause
    )
)
pause
