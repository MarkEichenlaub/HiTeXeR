@echo off
setlocal enabledelayedexpansion

set CORPUS=asy_corpus
set OUTDIR=comparison
set ASY="C:\Program Files\Asymptote\asy.exe"

set FILES[0]=c10_L1_script_0.asy 01_graph_tangent
set FILES[1]=c10_L10_script_11.asy 02_graph_area
set FILES[2]=c321_L12_script_11.asy 03_picture_composite
set FILES[3]=c57_L17_script_0.asy 04_3d_wireframe
set FILES[4]=c462_L11_script_85.asy 05_3d_circle
set FILES[5]=c10_L1_script_19.asy 06_unit_circle
set FILES[6]=c53_L13_script_14.asy 07_petersen_graph
set FILES[7]=c10_L123_script_3.asy 08_zigzag_resistor
set FILES[8]=c4_L12_script_13.asy 09_geometry_incircle
set FILES[9]=c583_L10_p50523_problem_text_1.asy 10_spiral_grid

for /L %%i in (0,1,9) do (
    for /f "tokens=1,2" %%a in ("!FILES[%%i]!") do (
        echo Rendering %%a as %%b...
        %ASY% -f png -o "%OUTDIR%\%%b.png" "%CORPUS%\%%a" 2>"%OUTDIR%\%%b_asy_err.txt"
        if !errorlevel! neq 0 (
            echo   FAILED - see %%b_asy_err.txt
        ) else (
            echo   OK
        )
    )
)
echo Done.
