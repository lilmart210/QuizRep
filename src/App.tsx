import { useState,useEffect } from 'react'
import './App.css'

import { Dirent } from 'original-fs';


export type MyWindow = {
  backend : {
    openFolder : (dir? : string) => Promise<(string | undefined)>,
    listfolder : (dir : string) => Promise<Array<Dirent>>
    readFile : (dir : string) => Promise<string>
  }
} & typeof window
const mywindow = window as MyWindow;

export type Terms = {
  front : Array<string>,
  back : Array<string>
}

function TermToArr(term : string,delim : Array<string>){
  const newterms = [];
  let last = 0;

  for(let i = 0; i < term.length;i++){
    for(const d of delim){
      const subsec = term.slice(i,i + d.length);
      if(subsec != d) continue;

      const newt = term.slice(last,i);
      newterms.push(newt);

      last = i + 1;
    }

  }
  newterms.push(term.slice(last))
  return newterms;
}

//measure absolute time using date.now()
//takes the time in milliseconds
function useTimeout({onTimeout,onUpdate,duration} : {
  onTimeout : Function,
  onUpdate : Function,
  duration : number
}){
  //time in milliseconds
  let [delta,setDelta] = useState(0);
  const [interval,setInt] = useState<any>();
  let [initial,_] = useState(0);
  const [gostop,setgostop] = useState(false);

  const dx = 1;

  function reset(){
    setDelta(0);
    setgostop(true);
  }
  function resume(){
    setgostop(true);
  }
  function pause(){
    setgostop(false);
  }

  useEffect(()=>{
    if(gostop) createInterval();
  },[delta,gostop])

  function createInterval(){
    initial = Date.now();
    if(interval) clearTimeout(interval);

    const intv = setTimeout(function(){
      if(delta >= duration){
        console.log('stoped',delta,);
        onUpdate(delta);
        onTimeout();
        pause();
        setgostop(false);

      }else{
        const change = delta + (Date.now() - initial);
        setDelta(change);
        onUpdate(change);
      }

    },dx)
    setInt(intv);
  }

  function timeout(){
    setDelta(duration);
  }

  return {delta,resume,pause,reset,timeout};
}

function App() {
  //const [msg,setMsg] = useState('');
  const [directory,setDir] = useState<string>()
  const [files,setFiles] = useState<Array<string>>([]);
  const [selected,setSelected] = useState<string>();
  const [termlist,setTermList] = useState<Array<Terms>>([]);

  const [SelectedTerm,SetSelectedTerm] = useState<Terms>();

  const [duration,setDuration] = useState(5000);
  //const [level,setLevel] = useState(0);
  const [points,setPoints] = useState(0);

  const [failed,setFailed] = useState(false);

  //front or back
  const [sides,setSides] = useState(false);
  //interval control
  const timer = useTimeout({
    duration : duration,
    onTimeout : TimeoutFailed,
    onUpdate : ()=>{}
  });

  const termdef = '[ d ]';
  const newline = '\r\n';
  const betdefs = [',','，'];

  function GrabFolder(){
    mywindow.backend.openFolder()
    .then((res)=>{
      setDir(res);
    });
  }

  useEffect(()=>{
    if(!directory) return;

    mywindow.backend.listfolder(directory)
    .then(res=>{
      if(!res) return;
      const remad = res.map(itm=>itm.name);
      setFiles(remad);
    })
    .catch(e=>console.log(e))
  },[directory])

  useEffect(()=>{
    if(!selected || !directory) return;
    mywindow.backend.readFile(directory + '\\' + selected)
    .then(res=>{
      //parse the file
      if(!res)return;
      const lines = res.split(newline);
      const termarr = lines.map((itm)=>{
        const fb = itm.split(termdef)
        const front = fb[0];
        const back = fb[1];

        return {
          front : TermToArr(front,betdefs),
          back : TermToArr(back,betdefs)
        }
      });

      setTermList(termarr);

    })

  },[selected])

  function randompick(){
    const len = termlist.length;
    const pi = Math.floor(Math.random() * len);

    SetSelectedTerm(termlist[pi]);

  }
  
  function TimeoutFailed(){
    setFailed(true);
  }

  function reset(){
    stop();
    SetSelectedTerm(undefined);
    setFailed(false);
    timer.reset();
  }

  function start(){
    setFailed(false);
    timer.reset();
    randompick()
  }

  function stop(){
    timer.pause();
  }

  function MatchGuess(arr : Array<string>,guess : string){
    for(const ans of arr){
      //remove beggining spaces
      const remspace = (samp : string)=>samp.split('').reduce((p,c)=>{
        if(p.length) return p + c;
        return c == ' ' ? p : p + c;
      },'');
      //shouldn't be ending spaces?
      const nobeg = remspace(ans);
      const noend = remspace(nobeg.split('').reverse().join(''))
      const finans = noend.split('').reverse().join('');
      console.log(finans,guess,arr,)
      if(finans == guess) return true;
    }
    return false;
  }

  function Submit(e : React.KeyboardEvent<HTMLInputElement>){
    if(!e.shiftKey && e.key == 'Enter'){
      const phrase = e.currentTarget.value;
      //match the guess
      if(!SelectedTerm) return; 
      const lis = sides ? SelectedTerm.front : SelectedTerm.back;
      const correct = MatchGuess(lis,phrase);
      if(correct){
        if(!failed){
          let newpoints = points + 1000 * ((duration - timer.delta) / duration);
          setPoints(Math.floor(newpoints));
        }
        start();
      }
      e.currentTarget.value = ''

    }else if(e.shiftKey && e.key == 'Enter'){
      e.currentTarget.value = '';
    }else if(e.key == 'Escape'){
      timer.timeout();
    }
  }
  function Newduration(e : React.ChangeEvent<HTMLInputElement>){
    if(e.currentTarget.value){
      setDuration(parseInt(e.currentTarget.value));
    }
  }

  return <div className='Super'>
    <div className='Header'>
      <button onClick={GrabFolder}>Import</button>
      <label>between sides {termdef}</label>
      <label>between lines {`${newline.replace('\n','\\n')}`}</label>
      <label>between definitions {betdefs.join(' or ')}</label>
      <label>Shift + enter quick clear</label>
      <label>| esc to give up</label>
      <label>||Points {points}</label>
      <input onChange={Newduration} type='number' placeholder='Duration(ms)'/>
      <button onClick={start}>start</button>
      <button onClick={stop}>stop</button>
      <button onClick={()=>setSides(!sides)}>{sides ? 'back' : 'front'}</button>
      <button onClick={reset}>reset</button>
    </div>

    <div className='Body'>
      <div className='Navigation'>
        <label>files</label>
        {
          files.map((itm,i)=>(
            <button className={`${selected == itm ? 'Selected' : ''}`}
            key={i} onClick={()=>setSelected(itm)}>
              {itm}
            </button>
          ))
        }
      </div>

      <div className='Main'>
        <div className='Panel'>
          
          <label className='Term'>
            {
              SelectedTerm &&
              `${sides ? SelectedTerm.back : SelectedTerm.front}
              `
            }
            {
              SelectedTerm && failed && <>
              <br/>
              {`${failed ? (sides ? SelectedTerm.front : SelectedTerm.back) : ''}`}
              </>
            }
          </label>
          <progress value={timer.delta} max={duration}></progress>
          <input onKeyDown={Submit}></input>
        </div>
      </div>
    </div>

  </div>
}

export default App
