// capture_audio.swift
// Captures system audio via ScreenCaptureKit and writes raw float32 PCM to stdout.
// Usage: capture_audio [sample_rate] [channels]
// Defaults: 44100 Hz, 1 channel

import ScreenCaptureKit
import CoreMedia
import Foundation

let sampleRate = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) ?? 44100 : 44100
let channels = CommandLine.arguments.count > 2 ? Int(CommandLine.arguments[2]) ?? 1 : 1

// Write to stderr for logging (stdout is reserved for audio data)
func log(_ msg: String) {
    FileHandle.standardError.write("[\(msg)]\n".data(using: .utf8)!)
}

class AudioCaptureDelegate: NSObject, SCStreamOutput {
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }

        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }

        let length = CMBlockBufferGetDataLength(blockBuffer)
        var data = Data(count: length)

        data.withUnsafeMutableBytes { ptr in
            guard let baseAddress = ptr.baseAddress else { return }
            CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: length, destination: baseAddress)
        }

        // Write raw audio bytes to stdout
        FileHandle.standardOutput.write(data)
    }
}

// Main async entry
let semaphore = DispatchSemaphore(value: 0)

Task {
    do {
        // Get shareable content
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)

        guard let display = content.displays.first else {
            log("ERROR: No display found")
            exit(1)
        }

        log("Display: \(display.width)x\(display.height)")

        // Filter: capture entire display (needed to get system audio)
        let filter = SCContentFilter(display: display, excludingWindows: [])

        // Config: audio only (minimal video)
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = false
        config.sampleRate = sampleRate
        config.channelCount = channels
        // Minimal video to reduce overhead
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 fps

        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        let delegate = AudioCaptureDelegate()

        try stream.addStreamOutput(delegate, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))

        try await stream.startCapture()
        log("STARTED: Capturing system audio at \(sampleRate)Hz \(channels)ch")

        // Run forever until killed
        semaphore.wait()

    } catch {
        log("ERROR: \(error)")
        exit(1)
    }
}

// Keep the process alive
dispatchMain()
