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
  Paper,
  CloseButton,
  Badge,
} from "@mantine/core";
import { DbObjectType, Event } from "@/types";
import { formRootRule, isNotEmpty, useForm } from "@mantine/form";

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
    type: DbObjectType.EVENT,
    title: "",
    dates: [
      {
        uuid: crypto.randomUUID(),
        start: "",
        end: "",
        timeLine: [
          {
            time: "",
            description: "Starting time",
          },
        ],
        price: 0,
      },
    ],
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

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      title: "",
      description: "",
      mainImage: "",
      eventLocation: {
        country: "",
        city: "",
        street: "",
        location: "",
      },
      dates: [],
    },
    validate: (values) => {
      if (active === 0) {
        return {
          title: values.title.trim() ? null : "Title is required",
          description: values.description.trim()
            ? null
            : "Description is required",
          mainImage: values.mainImage.trim() ? null : "Image URL is required",
        };
      }
      if (active === 1) {
        return {
          // eventLocation: {
          // [formRootRule]: isNotEmpty("At least one employee is required"),
          // country: values.eventLocation.country.trim()
          //   ? null
          //   : "Country is required",
          // city: values.eventLocation.city.trim() ? null : "City is required",
          // street: values.eventLocation.street.trim()
          //   ? null
          //   : "Street is required",
          // location: values.eventLocation.location.trim()
          //   ? null
          //   : "Location is required",
          // },
          // country: values.eventLocation.country.trim()
          //   ? null
          //   : "Country is required",
        };
      }
      if (active === 2) {
        return {};
      }

      return {};
    },
  });

  const [active, setActive] = useState(0);
  const nextStep = () => {
    console.log(form.errors);
    // setActive((current) => current + 1);
    setActive((current) => {
      if (form.validate().hasErrors) {
        return current;
      }
      return current < 2 ? current + 1 : current;
    });
  };
  const prevStep = () =>
    setActive((current) => (current > 0 ? current - 1 : current));

  const handleCreate = () => {
    form.validate();
    if (form.isValid()) {
      // onCreate(form.values);
      onClose();
    }
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
          color="yellow"
          label="Event info"
          description="Give the title, content and a display image."
        >
          <Stack>
            <TextInput
              label="Title"
              placeholder="Enter event title"
              key={form.key("title")}
              {...form.getInputProps("title")}
            />
            <Textarea
              label="Description"
              placeholder="Enter event description"
              key={form.key("description")}
              {...form.getInputProps("description")}
            />
            <TextInput
              label="Image URL"
              placeholder="Enter display image URL"
              key={form.key("mainImage")}
              {...form.getInputProps("mainImage")}
            />
          </Stack>
        </Stepper.Step>

        {/* ====================== Event location ==================== */}

        <Stepper.Step
          color="yellow"
          label="Location"
          description="Set the event location"
        >
          <Stack>
            <TextInput
              label="Country"
              placeholder="Enter country"
              key={form.key("eventLocation.country")}
              {...form.getInputProps("eventLocation.country")}
            />
            <TextInput
              label="City"
              placeholder="Enter city"
              key={form.key("eventLocation.city")}
              {...form.getInputProps("eventLocation.city")}
            />
            <TextInput
              label="Street"
              placeholder="Enter street address"
              key={form.key("eventLocation.street")}
              {...form.getInputProps("eventLocation.street")}
            />
            <TextInput
              label="Location"
              placeholder="Enter event building or location"
              key={form.key("eventLocation.location")}
              {...form.getInputProps("eventLocation.location")}
            />
          </Stack>
        </Stepper.Step>

        {/* ====================== Event dates ==================== */}

        <Stepper.Step
          color="yellow"
          label="Set the date"
          description="Set the event date(s)"
        >
          <Stack>
            {newEvent.dates.map((dateEntry, index) => (
              <Paper key={dateEntry.uuid} p={"10"} radius="md" withBorder>
                <CloseButton
                  color="red"
                  onClick={() =>
                    setNewEvent((prev) => ({
                      ...prev,
                      dates: prev.dates.filter((_, i) => i !== index),
                    }))
                  }
                />
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

                <Group>
                  {dateEntry.timeLine.map((timeLineEntry, timeIndex) => (
                    <Paper
                      key={timeLineEntry.time}
                      p={"10"}
                      radius="md"
                      withBorder
                      w={150}
                    >
                      <CloseButton
                        color="red"
                        onClick={() =>
                          setNewEvent((prev) => {
                            const updatedDates = [...prev.dates];
                            updatedDates[index].timeLine.splice(timeIndex, 1);
                            return { ...prev, dates: updatedDates };
                          })
                        }
                      />
                      <TextInput
                        label="Time"
                        type="time"
                        value={timeLineEntry.time}
                        onChange={(e) =>
                          setNewEvent((prev) => {
                            const updatedDates = [...prev.dates];
                            updatedDates[index].timeLine[timeIndex].time =
                              e.target.value;
                            return { ...prev, dates: updatedDates };
                          })
                        }
                      />
                      <TextInput
                        label="Description"
                        placeholder="Enter description"
                        value={timeLineEntry.description}
                        onChange={(e) =>
                          setNewEvent((prev) => {
                            const updatedDates = [...prev.dates];
                            updatedDates[index].timeLine[
                              timeIndex
                            ].description = e.target.value;
                            return { ...prev, dates: updatedDates };
                          })
                        }
                      />
                    </Paper>
                  ))}
                </Group>
                <Button
                  variant="default"
                  onClick={() =>
                    setNewEvent((prev) => ({
                      ...prev,
                      dates: prev.dates.map((date, i) => {
                        if (i === index) {
                          return {
                            ...date,
                            timeLine: [
                              ...date.timeLine,
                              { time: "", description: "" },
                            ],
                          };
                        }
                        return date;
                      }),
                    }))
                  }
                >
                  Add timeline entry
                </Button>
              </Paper>
            ))}
            <Button
              color="yellow"
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

            {!form.isValid() && <Badge color="red">{form.errors.dates}</Badge>}
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
        <Button color="red" onClick={active === 3 ? handleCreate : nextStep}>
          {active === 3 ? "Create Event" : "Next step"}
        </Button>
      </Group>
    </Modal>
  );
}
