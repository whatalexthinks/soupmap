# Custom analytics

Replit supplies the published site's tracker. No analytics script, website ID,
credentials or analytics environment variables are added by the app.
Enable analytics in Publishing settings and publish/republish to collect events.
Development and blocked/offline trackers are safe no-ops.

| Event | When | Properties |
| --- | --- | --- |
| `search_performed` | A changed, nonempty query settles for 600 ms | `result_count`, `city`, `cuisine`, `shared_list` |
| `filter_changed` | A visitor selects a city, broth, cuisine, sort, name language or reset | `filter`, `value`; broth also has `enabled` |
| `collection_viewed` | Explore or Saved is selected | `collection` |
| `shop_opened` | A different shop's card opens, including deep links | `city`, `broth`, `shared_list` |
| `save_changed` | A shop is saved or removed | `saved`, `persistent`, `city`, `broth`, `shared_list` |
| `directions_clicked` | The directions link is activated; not proof of arrival | `city`, `broth` |
| `shop_link_copied` | Clipboard write succeeds | None |
| `street_view_opened` | The panorama successfully opens for the current shop | `city`, `broth` |
| `street_view_failed` | Opening fails, excluding canceled/stale attempts | None |
| `shortlist_link_created` | A valid shortlist link is generated | `shop_count` |
| `shortlist_link_copied` | Its clipboard write succeeds | `shop_count` |
| `shared_shortlist_opened` | A shared list loads; repeated card changes do not count again | `shop_count`, `missing_count`, `valid` |

## Privacy and interpretation

Custom event payloads exclude search text, precise/device location, shop IDs,
saved-shop contents, shortlist URLs/IDs, and raw errors. City/broth dimensions
describe public catalog categories, not the visitor's current location.
Do not add free-form text or bearer-link contents to analytics.

`save_changed.saved=false` represents a removal, not a conversion.
`persistent=false` means saving worked for this session but browser storage failed.
A created/copied link does not prove that another person received it. Shared-list
opens and saves with `shared_list=true` can help evaluate the sharing funnel.
Missing tracker events are not queued or replayed later; avoid delaying discovery
or increasing phone workload just to collect analytics.
