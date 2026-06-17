@echo off
REM Extract dashcam segment from F:\CARDV\Movie_F by timestamp range (ffmpeg).
REM
REM You omitted the DATE: set MOVIE_DATE to the recording date (YYYYMMDD), e.g. 20260209.
REM If the dashcam clock is 1hr ahead, set START_TIME=06:07:27 and END_TIME=06:25:40 instead.

set MOVIE_FOLDER=F:\CARDV\Movie_F
set MOVIE_DATE=20260209
REM Start time (HH:MM:SS). Use 07:07:27 if dashcam display; 06:07:27 if dashcam is 1hr ahead.
set START_TIME=07:07:27
REM End time (HH:MM:SS). Use 07:25:40 or 06:25:40 accordingly.
set END_TIME=07:25:40
cd /d "%~dp0"

if "%MOVIE_DATE%"=="" (
  echo ERROR: Set MOVIE_DATE at the top of this script to the recording date YYYYMMDD.
  pause
  exit /b 1
)

echo Extracting %START_TIME% to %END_TIME% on date %MOVIE_DATE% from %MOVIE_FOLDER%
echo.
REM Add --dry-run to only list matching files and exit without writing output.
C:\Users\kenne\miniconda3\python.exe extract_timestamp_range.py "%MOVIE_FOLDER%" --date %MOVIE_DATE% --start %START_TIME% --end %END_TIME%

echo.
pause
