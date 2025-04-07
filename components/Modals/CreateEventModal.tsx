import { useState } from "react";
import {
  Modal,
  TextInput,
  Textarea,
  Group,
  Button,
  Stack,
  Stepper,
  NumberInput,
} from "@mantine/core";
import { Event } from "@/types";

interface CreateEventModalProps {
  opened: boolean;
  onClose: () => void;
  onCreate: (event: Event) => void;
}

export default function CreateEventModal({
  opened,
  onClose,
  onCreate,
}: CreateEventModalProps) {
  const [newEvent, setNewEvent] = useState<Event>({
    uuid: "",
    created_at: new Date().toISOString(),
    type: "event",
    title: "",
    dates: [],
    description: "",
    mainImage: "",
    images: [],
    eventLocation: {
      country: "",
      city: "",
      street: "",
      location: "",
    },
  });

  const [active, setActive] = useState(1);
  const nextStep = () =>
    setActive((current) => (current < 3 ? current + 1 : current));
  const prevStep = () =>
    setActive((current) => (current > 0 ? current - 1 : current));

  const handleCreate = () => {
    onCreate(newEvent); // Pass the new event to the parent component
    onClose(); // Close the modal
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create New Event"
      size={"auto"}
    >
      <Stepper active={active} onStepClick={setActive}>
        {/* ====================== Event info ==================== */}
        <Stepper.Step
          label="Event info"
          description="Give the title, content and a display image."
        >
          <Stack>
            <TextInput
              label="Title"
              placeholder="Enter event title"
              value={newEvent.title}
              onChange={(e) =>
                setNewEvent((prev) => ({ ...prev, title: e.target.value }))
              }
            />
            <Textarea
              label="Description"
              placeholder="Enter event description"
              value={newEvent.description}
              onChange={(e) =>
                setNewEvent((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
            />
            <TextInput
              label="Image URL"
              placeholder="Enter display image URL"
              value={newEvent.mainImage}
              onChange={(e) =>
                setNewEvent((prev) => ({ ...prev, mainImage: e.target.value }))
              }
            />
          </Stack>
        </Stepper.Step>

        {/* ====================== Event location ==================== */}

        <Stepper.Step label="Location" description="Set the event location">
          <Stack>
            <TextInput
              label="Country"
              placeholder="Enter country"
              value={newEvent.eventLocation?.country || ""}
              onChange={(e) =>
                //   setNewEvent((prev) => ({
                //     ...prev,
                //     eventLocation: {
                //       ...prev.eventLocation,
                //       country: e.target.value,
                //     },
                //   }))
                console.log(e)
              }
            />
            <TextInput
              label="City"
              placeholder="Enter city"
              value={newEvent.eventLocation?.city || ""}
              onChange={(e) =>
                //   setNewEvent((prev) => ({
                //     ...prev,
                //     eventLocation: {
                //       ...prev.eventLocation,
                //       city: e.target.value,
                //     },
                //   }))
                console.log(e)
              }
            />
            <TextInput
              label="Street"
              placeholder="Enter street address"
              value={newEvent.eventLocation?.street || ""}
              onChange={(e) =>
                // setNewEvent((prev) => ({
                //   ...prev,
                //   eventLocation: {
                //     ...prev.eventLocation,
                //     street: e.target.value,
                //   },
                // }))
                console.log(e)
              }
            />
            <TextInput
              label="Location"
              placeholder="Enter event building or location"
              value={newEvent.eventLocation?.street || ""}
              onChange={(e) =>
                // setNewEvent((prev) => ({
                //   ...prev,
                //   eventLocation: {
                //     ...prev.eventLocation,
                //     street: e.target.value,
                //   },
                // }))
                console.log(e)
              }
            />
          </Stack>
        </Stepper.Step>

        {/* ====================== Event dates ==================== */}

        <Stepper.Step label="Set the date" description="Set the event date(s)">
          <Stack>
            {newEvent.dates.map((dateEntry, index) => (
              <div
                key={dateEntry.uuid}
                style={{
                  border: "1px solid #ccc",
                  padding: "10px",
                  borderRadius: "5px",
                  marginBottom: "10px",
                }}
              >
                <Group grow>
                  <TextInput
                    label="Start Date"
                    type="datetime-local"
                    value={dateEntry.start}
                    onChange={(e) =>
                      setNewEvent((prev) => {
                        const updatedDates = [...prev.dates];
                        updatedDates[index].start = e.target.value;
                        return { ...prev, dates: updatedDates };
                      })
                    }
                  />
                  <TextInput
                    label="End Date"
                    type="datetime-local"
                    value={dateEntry.end}
                    onChange={(e) =>
                      setNewEvent((prev) => {
                        const updatedDates = [...prev.dates];
                        updatedDates[index].end = e.target.value;
                        return { ...prev, dates: updatedDates };
                      })
                    }
                  />
                </Group>
                <NumberInput
                  label="price"
                  placeholder="Enter ticket price"
                  value={dateEntry.price}
                  onChange={(e) =>
                    //TODO
                    console.log(e)
                  }
                />
                <Button
                  color="red"
                  onClick={() =>
                    setNewEvent((prev) => ({
                      ...prev,
                      dates: prev.dates.filter((_, i) => i !== index),
                    }))
                  }
                >
                  Remove Date Entry
                </Button>
              </div>
            ))}
            <Button
              onClick={() =>
                setNewEvent((prev) => ({
                  ...prev,
                  dates: [
                    ...prev.dates,
                    {
                      uuid: crypto.randomUUID(),
                      start: "",
                      end: "",
                      timeLine: [],
                      price: undefined,
                      external_link: "",
                    },
                  ],
                }))
              }
            >
              Add Date Entry
            </Button>
          </Stack>
        </Stepper.Step>
        <Stepper.Completed>
          Completed, click back button to get to previous step
        </Stepper.Completed>
      </Stepper>

      <Group justify="center" mt="xl">
        <Button variant="default" onClick={prevStep}>
          Back
        </Button>
        <Button onClick={nextStep}>Next step</Button>
      </Group>
    </Modal>
  );
}
