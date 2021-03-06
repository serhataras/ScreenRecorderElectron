import React, {Component} from 'react';
//@ts-ignore
import RecordRTC, {MediaStreamRecorder, MultiStreamRecorder, MRecordRTC, RecordRTCPromisesHandler} from 'recordrtc';
// In the renderer process.
import {desktopCapturer} from 'electron';

import {
    getAllVideoMetaData,
    getVideo,
    sendVideoViaSocketIO,
    socket
} from './ScreenRecorderApi';
import {v4 as uuidv4} from 'uuid';
import {VideoData} from '../../types/VideoData';
import {VideoMetadata} from '../../types/VideoMetadata';
import VideoPlayerComponent from '../VideoPlayer/VideoPlayerComponent';
import {batchDurationInSeconds, videoDurationInSeconds} from "../../constants/Constants";

interface ScreenRecorderProps {
}

interface ScreenRecorderState {
    // @ts-ignore
    recorder: RecordRTC | null;
    stream: MediaStream | null;
    stream2: MediaStream | null;
    type: RecordType | null;
    batchCounter: number;
    activeRecordingSessionVideoName: string;
    startingTimeOfActiveRecordingSession: string;
    videoMetaDataList: VideoMetadata[];
    videoUrl: string;
}

type RecordType = 'video' | 'screen';

class ScreenRecorder extends Component <ScreenRecorderProps, ScreenRecorderState> {

    constructor(props: ScreenRecorderProps) {
        super(props);
        this.startRecording = this.startRecording.bind(this);
        this.stopRecording = this.stopRecording.bind(this);
        this.onBlobAvailable = this.onBlobAvailable.bind(this);
        this.state = {
            recorder: null,
            stream: null,
            stream2: null,
            type: 'screen',
            batchCounter: 1,
            activeRecordingSessionVideoName: '',
            startingTimeOfActiveRecordingSession: '',
            videoMetaDataList: [],
            videoUrl: ''
        };
    }

    componentDidMount() {
        this.subscribeToScreenRecorderAPI();
        getAllVideoMetaData();
    }

    handleSocketConnection(updatedVideoDurationInSeconds: number, updatedBatchDurationInSeconds: number): any {
        if (socket) {
            socket.on('getAllVideoMetaData_result', (payload) => {
                let data: VideoMetadata[] = JSON.parse(payload);
                if (data.length > 0) {
                    console.log('getAllVideoMetaData_result incoming ');
                    data.forEach(dataItem => {
                        console.log('getAllVideoMetaData_result---->' + dataItem.fileName);
                    });
                    this.setState({videoMetaDataList: data});
                } else {
                    console.log('No Videos have been found on the server');
                }
            });

            socket.on('uploadFile_res', (payload) => {
                console.log(payload);
                getAllVideoMetaData();
            });
            socket.on('uploadBatch_res', (payload) => {
                console.log(payload);
            });
            socket.on('removeFile_ack', (payload) => {
                console.log(payload);
            });

            socket.on('downloadFile_ack', (payload) => {
                console.log(payload);
            });

            socket.on('error', (payload) => {
                console.log(payload);
            });

            socket.on('disconnect', (payload) => {
                console.log(payload);
            });

            socket.on('connect_error', (payload) => {
                console.log(payload);
            });

            socket.on('connection', () => {
                console.log(`Connected with the back-end`);
                socket.emit('updateRecordingParameters',
                    JSON.stringify({updatedVideoDurationInSeconds, updatedBatchDurationInSeconds}));
            });

            socket.on('heartbeat', () => {
                socket.emit('heartbeat', 'ack');
                console.log('heartbeat');
            });
        }
    }

    subscribeToScreenRecorderAPI() {
        this.handleSocketConnection(videoDurationInSeconds, batchDurationInSeconds);
    }

    sendVideoBlobToScreenRecorderApi(blob: Blob, videoData: VideoData) {
        sendVideoViaSocketIO(blob,
            videoData.fileName,
            videoData.videoStartingDate,
            videoData.videoDuration,
            videoData.orderInBatch);
    }

    generateTimeSignature(): string {
        let startingTimeOfActiveRecordingSession: string = '';
        let date: Date = new Date();
        startingTimeOfActiveRecordingSession =
            date.getFullYear() + '_' +
            date.getMonth() + '_' +
            date.getDay() + '_' +
            date.getHours() + '_' +
            date.getMinutes() + '_' +
            date.getSeconds();
        this.setState({startingTimeOfActiveRecordingSession});
        return startingTimeOfActiveRecordingSession;
    }

    generateVideoNameWithDateAndUUID(): string {
        let activeRecordingSessionVideoName = this.generateTimeSignature() + '__' + uuidv4();
        activeRecordingSessionVideoName = uuidv4();
        this.setState({activeRecordingSessionVideoName});
        return activeRecordingSessionVideoName;
    }

    resetBlobCounter(): void {
        const blobCounter = videoDurationInSeconds / batchDurationInSeconds;
        this.setState({batchCounter: blobCounter});
    }

    sendBlob(blob: Blob) {
        const videoData: VideoData = {
            fileName: this.state.activeRecordingSessionVideoName,
            videoStartingDate: this.state.startingTimeOfActiveRecordingSession,
            videoDuration: videoDurationInSeconds,
            orderInBatch: this.state.batchCounter
        };
        this.sendVideoBlobToScreenRecorderApi(blob, videoData);
    }

    async onBlobAvailable(blob: Blob) {
        if (this.state.batchCounter === 1) {
            //New video, setting new parameters or it
            this.sendBlob(blob);
            this.stopRecording();
        }
        this.sendBlob(blob);
        this.setState(prevState => ({
            batchCounter: prevState.batchCounter - 1
        }));
    }

    onRecordStateChange(state: string) {
        console.log(state);
        debugger;
    }

    async initializeRecordRTC() {
        // let stream = await (navigator.mediaDevices as any)
        //     .getDisplayMedia({video: true, audio: true});
        desktopCapturer.getSources({types: ['screen']}).then(async sources => {
            for (const source of sources) {
                if (source.name === 'Screen 3') {
                    try {
                        let stream = await navigator.mediaDevices.getUserMedia({
                            audio: false,
                            video: {
                            // @ts-ignore
                                mandatory: {
                                    chromeMediaSource: 'desktop',
                                    chromeMediaSourceId: source.id,
                                    minWidth: 2560,
                                    maxWidth: 2560,
                                    minHeight: 1440,
                                    maxHeight: 1440
                                }
                            }
                        })
                        this.setState({
                            stream: stream
                        });
                    } catch (e) {
                    }
                }
                else if (source.name === 'Screen 1') {
                    try {
                        let stream2 = await navigator.mediaDevices.getUserMedia({
                            audio: false,
                            video: {
                                // @ts-ignore
                                mandatory: {
                                    chromeMediaSource: 'desktop',
                                    chromeMediaSourceId: source.id,
                                    minWidth: 2560,
                                    maxWidth: 2560,
                                    minHeight: 1440,
                                    maxHeight: 1440
                                }
                            }
                        })
                        this.setState({
                            stream2: stream2
                        });
                    } catch (e) {
                    }
                }
            }
        })
        if(this.state.stream && this.state.stream2){
            this.handleStreamReady(this.state.stream, this.state.stream2)
        }
    }

    handleStreamReady(stream: MediaStream,stream2: MediaStream) {
        if (stream &&stream2)
            this.startRecording(stream, stream2);
    }

    startRecording(stream: MediaStream, stream2: MediaStream) {
        const ArrayOfMediaStreams = [stream,stream2];
        let recorder = new RecordRTC(stream,{
            recorderType: MediaStreamRecorder,
            type: 'video',
            mimeType: 'video/webm;codecs=h264',
            frameRate: 13,
            timeSlice: 1000 * batchDurationInSeconds,
            ondataavailable: this.onBlobAvailable,
            disableLogs: false,
        });
        //
        // recorder.mediaType = {
        //     audio: true, // or StereoAudioRecorder or MediaStreamRecorder
        //     video: true, // or WhammyRecorder or MediaStreamRecorder or WebAssemblyRecorder or CanvasRecorder
        //     gif: true    // or GifRecorder
        // };
        //
        // // mimeType is optional and should be set only in advance cases.
        // recorder.mimeType = {
        //     audio: 'audio/wav',
        //     video: 'video/webm',
        //     gif:   'image/gif'
        // };
        this.setState({
            recorder: recorder
        });

        recorder.startRecording();
        /*
       const recorder: RecordRTC = new RecordRTC(stream, {
           // audio, video, canvas, gif
           type: 'video',
           timeSlice: 1000,

           // audio/webm
           // video/webm;codecs=vp9
           // video/webm;codecs=vp8
           // video/webm;codecs=h264
           // video/x-matroska;codecs=avc1
           // video/mpeg -- NOT supported by any browser, yet
           // video/mp4  -- NOT supported by any browser, yet
           // audio/wav
           // audio/ogg  -- ONLY Firefox
           // demo: simple-demos/isTypeSupported.html
           mimeType: 'video/webm;codecs=h264',

           // MediaStreamRecorder, StereoAudioRecorder, WebAssemblyRecorder
           // CanvasRecorder, GifRecorder, WhammyRecorder
           recorderType: MediaStreamRecorder,

           // disable logs
           disableLogs: true,

           // get intervals based blobs
           // value in milliseconds
           timeSlice: 1000,

           // requires timeSlice above
           // returns blob via callback function
           ondataavailable: function(blob) {},

           // auto stop recording if camera stops
           checkForInactiveTracks: false,

           // requires timeSlice above
           onTimeStamp: function(timestamp) {},

           // both for audio and video tracks
           bitsPerSecond: 128000,

           // only for audio track
           audioBitsPerSecond: 128000,

           // only for video track
           videoBitsPerSecond: 128000,

           // used by CanvasRecorder and WhammyRecorder
           // it is kind of a "frameRate"
           frameInterval: 90,

           // if you are recording multiple streams into single file
           // this helps you see what is being recorded
           previewStream: function(stream) {},


           // used by CanvasRecorder and WhammyRecorder
           canvas: {
               width: 640,
               height: 480
           },

           // used by StereoAudioRecorder
           // the range 22050 to 96000.
           sampleRate: 96000,

           // used by StereoAudioRecorder
           // the range 22050 to 96000.
           // let us force 16khz recording:
           desiredSampRate: 16000,

           // used by StereoAudioRecorder
           // Legal values are (256, 512, 1024, 2048, 4096, 8192, 16384).
           bufferSize: 16384,

           // used by StereoAudioRecorder
           // 1 or 2
           numberOfAudioChannels: 2,

           // used by WebAssemblyRecorder
           frameRate: 30,

           // used by WebAssemblyRecorder
           bitrate: 128000,

           // used by MultiStreamRecorder - to access HTMLCanvasElement
           elementClass: 'multi-streams-mixer'

        });
        */
    }

    stopRecording() {
        const recorder = this.state.recorder;
        if (recorder) {
            recorder.stopRecording(function(blob:any) {
            });
            recorder.destroy();
            this.resetBlobCounter(); // resets the defualt value\
            this.generateVideoNameWithDateAndUUID();
        }
        if (this.state.stream && this.state.stream2) {
            this.startRecording(this.state.stream,this.state.stream2);
        }
    }

    haltRecording() {
        const recorder = this.state.recorder;
        if (recorder) {
            recorder.stopRecording(function(blob:any) {

            });
            recorder.destroy();
            this.resetBlobCounter(); // resets the defualt value\
            this.generateVideoNameWithDateAndUUID();
        }
    }

    getVideo(id: string): void {
        if (id) {
            if (socket) {
                console.log('getVideoSent: ' + id);
                socket.emit('getVideo', id);
            }
        }
    }

    downloadVideo() {
        getVideo(this.state.activeRecordingSessionVideoName);
    }

    render(): JSX.Element {
        return <div>
            <button onClick={this.initializeRecordRTC.bind(this)}>
                startRecording
            </button>
            <button onClick={this.haltRecording.bind(this)}>
                stopRecording
            </button>
            <button onClick={this.downloadVideo.bind(this)}>
                download
            </button>
            <button onClick={getAllVideoMetaData.bind(this)}>
                getAll
            </button>
            <VideoPlayerComponent videoMetaData={this.state.videoMetaDataList}>
            </VideoPlayerComponent>
        </div>;
    }

}

export default ScreenRecorder;
