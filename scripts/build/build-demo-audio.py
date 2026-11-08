"""Synthesize the original 24-second Zeno lounge loop. Developer tool, stdlib only.
No external recordings; the app bundles compressed AAC and loads it on demand.
"""
from pathlib import Path
import math, wave, struct, random, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'app/assets/audio';OUT.mkdir(exist_ok=True)
RATE=32000;DURATION=24;N=RATE*DURATION
samples=[0.0]*N
random.seed(732)
def note(midi,start,duration,gain=.1,kind='keys'):
 f=440*2**((midi-69)/12);a=int(start*RATE);length=int(duration*RATE)
 for j in range(length):
  if a+j>=N:break
  t=j/RATE;attack=min(1,t/.012);decay=math.exp(-t*(2.8 if kind=='keys' else 2));release=min(1,(length-j)/(RATE*.08));phase=2*math.pi*f*t
  v=math.sin(phase)+(.27*math.sin(phase*2)+.1*math.sin(phase*3) if kind=='keys' else .15*math.sin(phase*2))
  samples[a+j]+=v*gain*attack*decay*release
# 80 BPM, eight bars. Soft Rhodes-like chords, walking bass and brushed pulse.
chords=[[48,55,59,62,64],[45,52,55,59,60],[50,57,60,64,65],[43,50,53,57,59]]
for bar in range(8):
 start=bar*3;chord=chords[bar%4]
 for midi in chord:note(midi,start,2.9,.035)
 for beat in range(4):note(chord[0]-12+(12 if beat%2 else 0),start+beat*.75,.68,.07,'bass')
 for beat in range(8):
  a=int((start+beat*.375)*RATE)
  for j in range(int(.085*RATE)):
   if a+j<N:samples[a+j]+=(random.random()*2-1)*.007*math.exp(-j/(RATE*.018))
melody=[(76,.75),(74,2.25),(71,3.75),(72,5.25),(77,6.75),(76,8.25),(74,9.75),(71,11.25),(76,12.75),(79,14.25),(76,15.75),(72,17.25),(74,18.75),(77,20.25),(71,21.75)]
for midi,start in melody:note(midi,start,1.2,.045)
peak=max(abs(x) for x in samples);data=bytearray()
for i,x in enumerate(samples):
 fade=min(1,i/(RATE*.04),(N-i)/(RATE*.08));data.extend(struct.pack('<h',int(x/peak*.68*32767*fade)))
with tempfile.TemporaryDirectory() as tmp:
 wav=Path(tmp)/'lounge.wav'
 with wave.open(str(wav),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(data)
 subprocess.run(['/usr/bin/afconvert','-f','m4af','-d','aac','-b','64000',str(wav),str(OUT/'lounge.m4a')],check=True)
with wave.open(str(OUT/'chime.wav'),'wb') as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE)
 f.writeframes(b''.join(struct.pack('<h',int((math.sin(2*math.pi*880*j/RATE)+.4*math.sin(2*math.pi*1320*j/RATE))*4000*min(1,j/(RATE*.01))*math.exp(-j/(RATE*.16)))) for j in range(int(RATE*.6))))
print('Original lounge AAC:',(OUT/'lounge.m4a').stat().st_size,'bytes')
