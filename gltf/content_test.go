package main

import "testing"

func TestNormalizeExternalVideoURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		input        string
		platform     string
		externalURL  string
		embedURL     string
		expectErrMsg string
	}{
		{
			name:        "youtube watch url",
			input:       "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			platform:    "youtube",
			externalURL: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			embedURL:    "https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0",
		},
		{
			name:        "youtube short url without scheme",
			input:       "youtu.be/dQw4w9WgXcQ",
			platform:    "youtube",
			externalURL: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			embedURL:    "https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0",
		},
		{
			name:        "bilibili bv url",
			input:       "https://www.bilibili.com/video/BV1xx411c7mD/",
			platform:    "bilibili",
			externalURL: "https://www.bilibili.com/video/BV1xx411c7mD/",
			embedURL:    "https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&danmaku=0",
		},
		{
			name:        "bilibili episode embed url",
			input:       "https://player.bilibili.com/player.html?episodeId=123456",
			platform:    "bilibili",
			externalURL: "https://www.bilibili.com/bangumi/play/ep123456",
			embedURL:    "https://player.bilibili.com/player.html?episodeId=123456&danmaku=0",
		},
		{
			name:         "reject unsupported short bilibili url",
			input:        "https://b23.tv/abc123",
			expectErrMsg: "b23.tv short links are not supported yet; please paste the full bilibili.com URL",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			platform, externalURL, embedURL, err := normalizeExternalVideoURL(test.input)
			if test.expectErrMsg != "" {
				if err == nil {
					t.Fatalf("expected error %q, got nil", test.expectErrMsg)
				}
				if err.Error() != test.expectErrMsg {
					t.Fatalf("expected error %q, got %q", test.expectErrMsg, err.Error())
				}
				return
			}

			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if platform != test.platform {
				t.Fatalf("expected platform %q, got %q", test.platform, platform)
			}
			if externalURL != test.externalURL {
				t.Fatalf("expected external URL %q, got %q", test.externalURL, externalURL)
			}
			if embedURL != test.embedURL {
				t.Fatalf("expected embed URL %q, got %q", test.embedURL, embedURL)
			}
		})
	}
}
