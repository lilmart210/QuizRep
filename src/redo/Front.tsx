import { Dirent } from 'original-fs'
import './Front.css'
import { useEffect, useReducer, useRef, useState } from "react"
import { SaveDialogOptions, net } from 'electron'

export type MyWindow = {
    backend : {
      openFolder : (dir? : string) => Promise<(string | undefined)>,
      listfolder : (dir : string) => Promise<Array<Dirent>>
      readFile : (dir : string) => Promise<string>,
      CreateDialog : (opts : SaveDialogOptions) => Promise<string | undefined>,
      SaveFileData : (apath : string,data : string) => void
    }
  } & typeof window
  
  const mywindow = window as MyWindow;

type Card = {
    front : string,
    back : string
}

type Modes = 'Study' | 'Create'

function GetExt(aname : string){
    const ext = aname.split('.')
    return ext.length ? ext[ext.length - 1] : ''
}

function ParseCSV(text : string){
    const csv = [];
    const split = text.split('');
    let aword = ''
    let ignore = false;

    for(let i = 0;i< split.length;i++){
        const comma = split[i] == ',' && !ignore;
        const newline = split[i] == '\n';
        const lastend = i == split.length - 1 && split[i] == '"'

        if(comma || newline || lastend){
            csv.push(aword)
            aword = '';
        }

        if(split[i] == '"'){
            ignore = !ignore;
        }
        const exclude = ['\r','\n',',','"']
        if(i == split.length - 1 && !exclude.includes(split[i])){
            if(!exclude.includes(split[i])) aword += split[i];
            
            csv.push(aword);
        }

        if(exclude.includes(split[i]) && !ignore){
            continue
        }else if(ignore && split[i] == '"'){
            continue;
        }else {
            aword += split[i];
        }
    }
    return csv;
}

function ToCsv(text : string[],length : number){
    let res = '';

    for(let i = 0; i < text.length;i++){
        const aword = text[i].replace('"',"'");


        if(aword.includes(' ') || aword.includes(',')){
            res += `"${aword}"`;
        }else{
            res += aword
        }
        if(i != text.length - 1 && (i + 1) % length != 0) res += ','

        if((i + 1) % length == 0 && i != text.length - 1){
            res += '\n'
        }

    }

    return res
}

function TextToCards(text : string){
    const adata = ParseCSV(text);

    if(adata.length % 2 > 0 || adata.length == 0) return [];
    const res : Card[] = []
    for(let i = 0; i < adata.length / 2;i++){
        const front = i * 2;
        const back = i * 2 + 1;
        res.push({back : adata[back],front : adata[front]})
    }
    return res;
}


function RemoveleftPadding(term : string){
    let start = 0;
    for(let i =0;i<term.length;i++){
        if(term[i] == ' '){
            start += 1;
            continue;
        }
        break;
    }
    return term.slice(start,term.length);
}
function TermToArr(term : string){
    //ignore whitespaces before sub-section
    //break at the delims
    const words : string[] = [];
    let wordstart = false;
    let aword = '';

    for(let i = 0; i < term.length;i++){
        if(term[i] == ' ' && !wordstart) continue;
        if(term[i] == ','){
            wordstart = false;
            words.push(aword);
            aword = '';
            continue;
        }
        aword += term[i]
        if(aword) wordstart = true;

        if(i == (term.length - 1) && wordstart && aword) words.push(aword)
    }

    return words;
}
function Reverse(astr : string){
    let str = '';
    for(let i = 0;i < astr.length;i++){
        str += astr[(astr.length - 1) - i];
    }
    return str;
}

function useTimeout({callback,duration} : {callback : Function,duration : number}){
    const [CachedTime,SetCachedTime] = useState(0)
    const [TimeElapsed,SetTimeElapsed] = useState(0);
    const StartRef = useRef<number>(0);
    const intervalRef = useRef<any>();

    useEffect(()=>{
        //we managed to reach higher than the duration
        if(CachedTime + TimeElapsed < duration) return;
        if(callback) callback();
        Stop()
    },[Function,TimeElapsed,CachedTime])

    function Start(){
        StartRef.current = new Date().getTime()
        const id = setInterval(()=>{
            const currtime = new Date().getTime();
            const diff =currtime - StartRef.current;
            SetTimeElapsed(diff);
        },10)
        intervalRef.current = id;
    }

    function Stop(){
        const id = intervalRef.current;
        if(typeof id == 'undefined') return;
        clearInterval(id);
        SetCachedTime(TimeElapsed);
        SetTimeElapsed(0)
    }

    function Restart(){
        Stop()
        SetTimeElapsed(0);
        SetCachedTime(0);
    }

    return {
        Start,
        Stop,
        Restart,
        Elapsed : CachedTime + TimeElapsed
    }
}


export function Front(){

    const [Cards,SetCards] = useState<Card[]>([])
    //keeps track of how many times we have seen a card
    const [CardsSeen,SetCardsSeen] = useState<number[]>([]);

    const [Mode,SetMode] = useState<Modes>('Study')
    //curent cards in level | first card is card to be guessed
    const [StudyList,SetStudyList] = useState<Card[]>([])
    const [CurrentCard,SetCurrentCard] = useState<Card>();
    const [CurrentTerm,SetCurrentTerm] = useState<'front' | 'back'>();
    const [Level,SetLevel] = useState(0);
    const [Points,SetPoints] = useState(0);
    //progress bar for current level
    const [LevelProgress,SetLevelProgress] = useState(0);
    //progress bar for timer
    const [Progress,SetProgress] = useState(0);

    const [Directory,SetDirectory] = useState<string>()
    const [DirFiles,SetDirFiles] = useState<Array<string>>([])

    const [SelectedFile,SetSelectedFile] = useState<string>();
    const [Front,SetFront] = useState<'Front'|'Mixed'|'Back'>('Front');

    
    //how long each card stays on screen
    const [duration,setduration] = useState(10000);
    const [TimedOut,SetTimedOut] = useState(false);
    //how many cards in a single level
    const [TakeSize,SetTakeSize] = useState(5);
    //how many times each card should be shown before 
    const [RepeatLength,SetRepeatLength] = useState(1);

    const timer = useTimeout({callback : Failed,duration : duration});

    useEffect(()=>{
        const zarr  = Cards.map((itm,i)=>0);
        SetCardsSeen(zarr);
    },[Cards])

    useEffect(()=>{
        if(!SelectedFile) return;
        mywindow.backend.readFile(`${Directory}\\${SelectedFile}`).then((text)=>{
            const cardlist = TextToCards(text);
            SetCards(cardlist)
        })
    },[SelectedFile])

    function PopulateStudyList(){
        if(Cards.length == 0) return;
        SetLevel(prev=>prev+1);
        const levelcards : Card[] = [];
        //get unseen cards | seen < repeatlength
        let valid = CardsSeen.map((itm,i)=>itm < RepeatLength ? i : -1).filter(itm=>itm!=-1);

        //reset cards seen
        if(!valid.length){
            SetCardsSeen(Cards.map((itm,i)=>0));
            valid = Cards.map((itm,i)=>i);
        }

        //fill the valid length with random cards
        while(valid.length < TakeSize){
            const anum = Math.floor(Math.random() * Cards.length);
            if(valid.includes(anum)) continue;
            valid.push(anum);
        }
        
        //get cards for this level
        for(let i = 0;i < Math.min(Cards.length,TakeSize);i++){
            const rcard = Math.floor(Math.random() * valid.length);
            
            const cardpos = valid[rcard];
            //seen cards are correctly guessed cards
            //SetCardsSeen(prev=>prev.map((itm,i)=>i == cardpos ? itm + 1 : itm));

            valid = valid.filter((itm,i)=>i != rcard);
            
            //Cards[cardpos] => undefined
            levelcards.push(Cards[cardpos]);
        }
        
        const ret = levelcards.shift();
        
        SetStudyList(levelcards);
        return ret;
    }

    function PopStudyList(){
        let newterm : Card | undefined= StudyList[0];
        let poped = false;
        if(!StudyList.length){
            poped = true;
            newterm = PopulateStudyList();
        }
        
        if(!newterm) return;
        const rside = Math.random() > .5 ? 'Front' : 'Back'
        const termside = Front == 'Mixed' ? rside : Front;
        
        SetCurrentTerm(termside == 'Front' ? 'front' : 'back');
        SetCurrentCard(newterm)
        //this is cutting out two...
        if(!poped) SetStudyList(prev=>prev.filter((itm,i)=>i != 0));
    }

    function HandleEntry(e : React.KeyboardEvent<HTMLInputElement>){
        
        if(!CurrentCard || !CurrentTerm) return;
        const guess = e.currentTarget.value;

        const flipped = CurrentTerm == 'back' ? 'front' : 'back';
        let terms = TermToArr(CurrentCard[flipped]);
        terms = terms.map((itm)=>{
            const rml = RemoveleftPadding(itm);
            const rev = Reverse(rml);
            const rmr = RemoveleftPadding(rev);
            return Reverse(rmr);
        });

        const correct = terms.includes(guess);
        const cardloc = Cards.findIndex((itm)=>itm.back == CurrentCard.back && itm.front == CurrentCard.front);

        if(correct && !TimedOut){
            SetPoints(prev=>prev+100);
            SetCardsSeen(prev=>prev.map((itm,i)=>i == cardloc ? itm + 1 : itm));
            PopStudyList();
            timer.Restart();
            timer.Start()
            SetTimedOut(false);
        }else if(correct && TimedOut){
            PopStudyList();
            timer.Restart()
            timer.Start();
            SetTimedOut(false);
        }else if(!correct && !TimedOut){
            SetPoints(prev=>prev-10);   
        }

    }

    function Failed(){
        SetProgress(0)
        SetTimedOut(true);
        timer.Restart();
    }

    function Start(){
        if(!StudyList.length) PopStudyList()
        timer.Start();

    }
    
    function Restart(){
        SetStudyList([])
        SetLevel(0)
        SetPoints(0);
        SetLevelProgress(0);
        SetProgress(0);
        SetStudyList([])
        SetCurrentCard(undefined)
        SetCurrentTerm(undefined);
        SetCardsSeen(Cards.map(itm=>0));
        SetTimedOut(false);

        timer.Restart();

    }
    function Pause(){
        timer.Stop();
    }

    function ChangeModes(){
        SetMode(prev=> prev == 'Study' ? 'Create' : 'Study');
    }

    function RemoveEditableCard(pos : number){
        SetCards(prev=>prev.filter((itm,i)=>i != pos));
    }
    function SetEditableFront(pos: number,val : string){
        SetCards(prev=>prev.map((itm,i)=>(i == pos ? {back : itm.back,front : val} as Card : itm)))
    }
    function SetEditableBack(pos : number,val : string){
        
        SetCards(prev=>prev.map((itm,i)=>(i == pos ? {back : val,front : itm.front} as Card : itm)))
    }
    function OpenFile(aname : string){
        SetSelectedFile(prev=>{
            const res = prev == aname ? undefined : aname
            if(prev == aname) SetCards([]) 
            return res;
        });
    }

    function Submit(e : React.KeyboardEvent<HTMLInputElement>){
        if(e.key == 'Escape'){
            //quick submit failure
            Failed()
        }else if(e.shiftKey && e.key == 'Enter'){
            //quick erase
            e.currentTarget.value = ''
        }else if(e.key == 'Enter'){
            //submit
            HandleEntry(e);
            e.currentTarget.value = '';
        }
    }

    function SaveCsv(){
        const apath = mywindow.backend.CreateDialog({properties: ['showOverwriteConfirmation']})
        if(!apath) return;
        //convert to csv then write file
        const arr = Cards.reduce((p,c)=>([...p,c.front,c.back]),[] as string[])
        const csvf = ToCsv(arr,2);
        mywindow.backend.SaveFileData(`${Directory}\\${SelectedFile}`,csvf);
        //console.log(csvf);
    }

    function AddEditableCard(){
        const newcard : Card = {
            back : '',
            front : ''
        }
        SetCards(prev=>[...prev,newcard]);
    }

    async function GrabFolder(){
        const apath = await mywindow.backend.openFolder();
        if(!apath) return;
        SetDirectory(apath)
        const files = (await mywindow.backend.listfolder(apath)).map(itm=>itm.name);
        console.log(files.map(itm=>GetExt(itm)))
        SetDirFiles(files.filter((itm)=>GetExt(itm) == 'csv'));
    }

    const StudyName = `${Mode == 'Study' ? 'Study' : 'Hidden'}`
    const CreateName = `${Mode == 'Create' ? 'Create' : 'Hidden'}`

    let direction = '';

    if(Front == 'Front'){
        direction = 'Front'
    }else if(Front == 'Back'){
        direction = 'Back'
    }else if(Front == 'Mixed'){
        direction = 'Mixed'
    }
    const toguess = CurrentCard && CurrentTerm ?  CurrentCard[CurrentTerm] : '';
    const toanswer = TimedOut && CurrentCard && CurrentTerm ?  CurrentCard[CurrentTerm == 'back' ? 'front' : 'back'] : '';
    
    return (
        <div className='Main'>
            <div className='Header'>
                <button onClick={GrabFolder}>Open</button>
                <button onClick={()=>ChangeModes()}>Switch</button>
                {
                    Mode == 'Create' && (
                        <>
                            <button onClick={()=>SaveCsv()}>SaveCsv</button>
                        </>
                    )
                }
                {
                    Mode == 'Study' && (
                        <>
                            <button onClick={()=>SetFront(prev=>{
                                if(prev == 'Front') return 'Back';
                                if(prev == 'Back') return 'Mixed';
                                return 'Front'
                            })}>{direction}</button>
                            <button onClick={Start}>Start</button>
                            <button onClick={Pause}>Pause</button>
                            <button onClick={Restart}>Restart</button>

                            <select value={duration} onChange={(e)=>setduration(Number(e.currentTarget.value))}>
                                <option value={20_000}>20 seconds</option>
                                <option value={10_000}>10 seconds</option>
                                <option value={5_000}>5 seconds</option>
                                <option value={4_000}>4 seconds</option>
                                <option value={3_000}>3 seconds</option>
                                <option value={2_000}>2 seconds</option>
                                <option value={1_000}>1 second</option>
                                <option value={500}>1/2 second</option>
                            </select>
                            <select value={TakeSize} onChange={(e)=>SetTakeSize(Number(e.currentTarget.value))}>
                                <option value={1}>Take: 1</option>
                                <option value={2}>Take: 2</option>
                                <option value={3}>Take: 3</option>
                                <option value={4}>Take: 4</option>
                                <option value={5}>Take: 5</option>
                                <option value={6}>Take: 6</option>
                                <option value={10}>take : 10</option>
                                {Cards.length && <option value={Cards.length}>take : {Cards.length}</option>}
                            </select>
                            <select value={RepeatLength} onChange={(e)=>SetRepeatLength(Number(e.currentTarget.value))}>
                                <option value={1}>Repeat 1</option>
                                <option value={2}>Repeat 2</option>
                                <option value={3}>Repeat 3</option>
                                <option value={4}>Repeat 4</option>
                                <option value={5}>Repeat 5</option>
                                <option value={6}>Repeat 6</option>
                            </select>
                        </>
                    )
                }
            </div>
            <div className='Body'>
                <div className='Panel'>
                {
                            DirFiles.map((itm,i)=>(
                                <button className={`${SelectedFile == itm ? 'Selected' : ''}`} onClick={()=>OpenFile(itm)} key={i}>{itm}</button>
                            ))
                        }
                </div>
                <div className='PanelBody'>
                    <div className={StudyName}>
                        <div className='ScoreBoard'>
                            <label>{`Level: ${Level} Score: ${Points}`}</label>
                        </div>
                        <div className='Progress'>
                            <progress value={TakeSize - (StudyList.length + 1)} max={TakeSize}></progress>
                            <progress value={TimedOut? duration : timer.Elapsed} max={duration}></progress>
                        </div>
                        <label>{`${toguess} | ${toanswer}`}</label>
                        <input onKeyDown={Submit}/>
                    </div>
                    <div className={CreateName}>
                        {
                            Cards.map((itm,i)=>(
                                <div key={i} className='Row'>
                                    <input onChange={(e)=>SetEditableFront(i,e.currentTarget.value)} value={itm.front}/>
                                    <input onChange={(e)=>SetEditableBack(i,e.currentTarget.value)} value={itm.back}/>
                                    <button onClick={()=>RemoveEditableCard(i)}>x</button>
                                </div>
                            ))
                        }
                        <button className='AddButton' onClick={AddEditableCard}>
                            +
                        </button>
                    </div>

                </div>
            </div>
        </div>
    )
}