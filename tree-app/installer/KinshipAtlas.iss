#include "generated\version.iss"

[Setup]
AppId=KinshipAtlasPortable
AppName=Kinship Atlas
AppVersion={#AppVersion}
AppPublisher=Kinship Atlas contributors
DefaultDirName={localappdata}\Kinship Atlas
DisableDirPage=no
DisableProgramGroupPage=yes
UsePreviousAppDir=no
PrivilegesRequired=lowest
Uninstallable=no
CreateAppDir=yes
CreateUninstallRegKey=no
DirExistsWarning=no
OutputDir=..\..\dist
OutputBaseFilename=KinshipAtlas-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\launcher\kinship-atlas.ico
CloseApplications=no
RestartApplications=no
LicenseFile=..\..\LICENSE
InfoBeforeFile=install-notes.txt

[Files]
#include "generated\files.iss"

[Code]
var
  InstallationCompleted: Boolean;

function ManualUpdateGuidance: String;
begin
  Result := 'The installation/update did not complete. Download the latest release and manually apply the verified application files to your installation folder containing index.html.' + #13#10 +
    'Preserve GEDCOM files, media, primary-data.js, kinship-defaults.json and kinship-selections.json. Do not bypass antivirus warnings.' + #13#10 +
    'https://github.com/andyando/KinshipAtlas/releases/latest';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssDone then InstallationCompleted := True;
end;

procedure DeinitializeSetup;
begin
  if not InstallationCompleted then begin
    Log(ManualUpdateGuidance);
    if not WizardSilent then
      MsgBox(ManualUpdateGuidance, mbError, MB_OK);
  end;
end;

function GetFileAttributes(Name: String): LongWord;
  external 'GetFileAttributesW@kernel32.dll stdcall';

function SafeDestination(Name: String): Boolean;
var
  Attributes: LongWord;
  Parent: String;
begin
  Result := True;
  while Name <> '' do begin
    Attributes := GetFileAttributes(Name);
    if (Attributes <> $FFFFFFFF) and ((Attributes and $400) <> 0) then begin
      Result := False;
      Exit;
    end;
    Parent := ExtractFileDir(Name);
    if Parent = Name then Exit;
    Name := Parent;
  end;
end;

function ValidateInstallation: String;
var
  VersionSource: AnsiString;
  Allowed, Version: String;
  Start, Finish: Integer;
  FindRec: TFindRec;
begin
  Result := '';
#include "generated\checks.iss"
  if FileExists(ExpandConstant('{app}\index.html')) then begin
    if not LoadStringFromFile(ExpandConstant('{app}\version.js'), VersionSource) then begin
      Result := 'The selected application folder has no readable version.js.';
      Exit;
    end;

    Start := Pos('version:', String(VersionSource));
    if Start = 0 then begin Result := 'The installed version is not allocated.'; Exit; end;
    Version := Trim(Copy(String(VersionSource), Start + 8, 100));
    if (Copy(Version, 1, 1) <> '''') and (Copy(Version, 1, 1) <> '"') then begin
      Result := 'The installed version is not allocated.'; Exit;
    end;
    Finish := Pos(Copy(Version, 1, 1), Copy(Version, 2, Length(Version)));
    Version := Copy(Version, 2, Finish - 1);
    Allowed := '|{#AllowedVersions}|';
    if (Finish = 0) or (Pos('|' + Version + '|', Allowed) = 0) then
      Result := 'The installed version is not in this release history. Downgrades and unallocated versions are not supported.';
  end else if FindFirst(ExpandConstant('{app}\*'), FindRec) then begin
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') then begin
          Result := 'Choose an empty new folder or the existing application folder containing index.html.';
          Exit;
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := ValidateInstallation;
  if Result <> '' then Result := Result + #13#10#13#10 + ManualUpdateGuidance;
end;
